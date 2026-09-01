// Portal: Layer 1 auto-resume
// Looks up the most recent active voucher for a client MAC (or phone) in the last 24h.
// If found, the portal silently re-submits it to Omada — no new payment needed.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.3';

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0')).join('');
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function normalizePhone(p: string): string {
  let f = (p || '').replace(/\s+/g, '');
  if (f.startsWith('+')) f = f.substring(1);
  if (f.startsWith('0')) f = '254' + f.substring(1);
  if (f.startsWith('7') || f.startsWith('1')) f = '254' + f;
  return f;
}


// ---- Anti-sharing gate (server-side) ----
// The reveal card is only permitted when:
//   a) payment was confirmed within the last 6 minutes, AND
//   b) the voucher shows no sharing abuse (< 3 distinct MACs seen for it).
const REVEAL_WINDOW_MS = 6 * 60 * 1000;
async function revealAllowedFor(supabase: any, code: string, paidAtIso: string | null): Promise<boolean> {
  if (!code || !paidAtIso) return false;
  const paidAt = new Date(paidAtIso).getTime();
  if (!paidAt || Number.isNaN(paidAt)) return false;
  if (Date.now() - paidAt >= REVEAL_WINDOW_MS) return false;
  try {
    const { data } = await supabase
      .from('session_events')
      .select('client_mac')
      .eq('voucher_code', code)
      .not('client_mac', 'is', null)
      .limit(200);
    const macs = new Set((data || []).map((r: any) => r.client_mac));
    if (macs.size >= 3) {
      supabase.from('session_events').insert({
        event_type: 'voucher_share_suspected',
        voucher_code: code,
        outcome: 'reveal_blocked',
        details: { distinct_macs: macs.size },
      }).then(() => {}, () => {});
      return false;
    }
  } catch (_) { /* fail open on logging errors only */ }
  return true;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    // Resume is strictly per-device (MAC). One phone number can pay for
    // multiple devices, so phone-based resume would re-attach the wrong
    // device's voucher. Always require clientMac.
    const { clientMac, resumeToken } = await req.json().catch(() => ({}));
    if (!clientMac && !resumeToken) {
      return new Response(JSON.stringify({ active: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Fire-and-forget audit logger (never blocks the resume path)
    const logEvent = (row: Record<string, unknown>) => {
      try {
        supabase.from('session_events').insert(row).then(
          () => {},
          (e: unknown) => console.error('[session_events] insert failed', e),
        );
      } catch (e) {
        console.error('[session_events] logger error', e);
      }
    };

    // LAYER 2 — Silent token resume (handles MAC randomization). Package-duration bound.
    if (resumeToken && typeof resumeToken === 'string' && resumeToken.length >= 20) {
      const hash = await sha256Hex(resumeToken);

      // Capture the MAC the voucher was last seen on, so we can detect randomization.
      const { data: prior } = await supabase
        .from('vouchers')
        .select('code, used_by_mac, resume_token_macs, package_type, duration_hours, transaction_id')
        .eq('resume_token_hash', hash)
        .maybeSingle();
      const previousMac: string | null = prior?.used_by_mac ?? null;
      const isNewDevice = !!(clientMac && prior && !(prior.resume_token_macs || []).includes(clientMac));

      const { data: t } = await supabase.rpc('resume_session_by_token', {
        _token_hash: hash,
        _client_mac: clientMac || null,
      });
      const trow: any = Array.isArray(t) && t.length ? t[0] : null;
      if (trow) {
        const paidAt = new Date(trow.paid_at).getTime();
        const expiresAt = paidAt + (trow.duration_hours || 2) * 60 * 60 * 1000;
        if (expiresAt > Date.now()) {
          if (isNewDevice && previousMac && previousMac !== clientMac) {
            console.log('[mac-change]', { previousMac, clientMac, voucher: trow.voucher_code });
            logEvent({
              event_type: 'mac_randomization_detected',
              voucher_code: trow.voucher_code,
              package_type: trow.package_type,
              duration_hours: trow.duration_hours,
              client_mac: clientMac || null,
              previous_mac: previousMac,
              resume_source: 'token',
              outcome: 'resumed',
              details: { paid_at: trow.paid_at, expires_at: new Date(expiresAt).toISOString() },
            });
          }
          logEvent({
            event_type: 'voucher_resubmitted',
            voucher_code: trow.voucher_code,
            package_type: trow.package_type,
            duration_hours: trow.duration_hours,
            client_mac: clientMac || null,
            previous_mac: previousMac,
            resume_source: 'token',
            outcome: 'active',
            details: { new_device: isNewDevice, expires_at: new Date(expiresAt).toISOString() },
          });
          return new Response(JSON.stringify({
            active: true,
            voucher: trow.voucher_code,
            packageType: trow.package_type,
            durationHours: trow.duration_hours,
            paidAt: trow.paid_at,
            expiresAt: new Date(expiresAt).toISOString(),
            source: 'token',
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        } else {
          logEvent({
            event_type: 'resume_expired',
            voucher_code: trow.voucher_code,
            package_type: trow.package_type,
            duration_hours: trow.duration_hours,
            client_mac: clientMac || null,
            resume_source: 'token',
            outcome: 'expired',
          });
        }
      }
    }

    if (!clientMac) {
      return new Response(JSON.stringify({ active: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data } = await supabase.rpc('resume_session_for_mac', { _client_mac: clientMac });
    const row: any = Array.isArray(data) && data.length ? data[0] : null;

    if (!row) {
      return new Response(JSON.stringify({ active: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Honor the ACTUAL package duration (2h vs 24h), not a flat 24h window.
    // The RPC pre-filters last 24h for speed; we then enforce per-package expiry.
    const paidAt = new Date(row.paid_at).getTime();
    const expiresAt = paidAt + (row.duration_hours || 2) * 60 * 60 * 1000;
    if (expiresAt < Date.now()) {
      logEvent({
        event_type: 'resume_expired',
        voucher_code: row.voucher_code,
        package_type: row.package_type,
        duration_hours: row.duration_hours,
        client_mac: clientMac,
        transaction_id: row.transaction_id || null,
        resume_source: 'mac',
        outcome: 'expired',
      });
      return new Response(JSON.stringify({ active: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    logEvent({
      event_type: 'voucher_resubmitted',
      voucher_code: row.voucher_code,
      package_type: row.package_type,
      duration_hours: row.duration_hours,
      transaction_id: row.transaction_id || null,
      client_mac: clientMac,
      previous_mac: clientMac,
      resume_source: 'mac',
      outcome: 'active',
      details: { expires_at: new Date(expiresAt).toISOString() },
    });

    return new Response(JSON.stringify({
      active: true,
      voucher: row.voucher_code,
      packageType: row.package_type,
      durationHours: row.duration_hours,
      paidAt: row.paid_at,
      expiresAt: new Date(expiresAt).toISOString(),
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ active: false, error: (e as Error).message }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});