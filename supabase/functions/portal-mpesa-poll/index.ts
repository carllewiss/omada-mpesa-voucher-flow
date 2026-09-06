// Portal: Poll payment status; on confirmed payment, atomically claim a voucher and return it.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Layer 2 helper — generate a random URL-safe token and its sha-256 hash.
async function mintResumeToken(): Promise<{ token: string; hash: string }> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const token = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  const hash = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0')).join('');
  return { token, hash };
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
    const { checkoutRequestId, clientMac } = await req.json();
    if (!checkoutRequestId) {
      return new Response(JSON.stringify({ error: 'checkoutRequestId required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: tx } = await supabase
      .from('transactions')
      .select('*')
      .eq('checkout_request_id', checkoutRequestId)
      .maybeSingle();

    if (!tx) {
      return new Response(JSON.stringify({ status: 'unknown' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (tx.status === 'pending') {
      return new Response(JSON.stringify({ status: 'pending' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (tx.status === 'failed' || tx.status === 'cancelled') {
      return new Response(JSON.stringify({ status: 'failed', error: tx.result_desc || 'Payment failed' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (tx.status === 'success' || tx.status === 'paid') {
      const paidAtIso = tx.updated_at || tx.created_at || new Date().toISOString();

      // The voucher is normally issued server-side the moment payment is confirmed
      // (mpesa-callback / stk-query / reconcile). Claim here only as a last resort.
      let code: string | null = tx.voucher_code || null;
      let durationHours: number | null = null;
      let packageType: string | null = tx.package_type || null;

      if (!code) {
        const { data: existingAuth } = await supabase
          .from('client_authorizations')
          .select('mpesa_receipt, package_type, duration_hours')
          .eq('checkout_request_id', checkoutRequestId)
          .maybeSingle();
        if (existingAuth?.mpesa_receipt?.startsWith('VC-')) {
          code = existingAuth.mpesa_receipt.substring(3);
          durationHours = existingAuth.duration_hours;
          packageType = existingAuth.package_type;
        }
      }

      if (!code) {
        const { data: claimed, error: claimErr } = await supabase
          .rpc('claim_voucher_for_transaction', {
            _transaction_id: tx.id,
            _package_type: tx.package_type,
            _client_mac: clientMac || null,
          });

        if (claimErr || !claimed || claimed.length === 0) {
          return new Response(JSON.stringify({
            status: 'no_voucher',
            error: 'Payment received but no vouchers available. Please contact support.',
          }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const v = claimed[0];
        code = v.code;
        durationHours = v.duration_hours;
        packageType = v.package_type;

        await supabase
          .from('client_authorizations')
          .update({
            payment_status: 'paid',
            mpesa_receipt: `VC-${v.code}`,
            mac_address: clientMac || null,
            updated_at: new Date().toISOString(),
          })
          .eq('checkout_request_id', checkoutRequestId);

        supabase.from('session_events').insert({
          event_type: 'voucher_issued',
          voucher_code: v.code,
          package_type: v.package_type,
          duration_hours: v.duration_hours,
          transaction_id: tx.id,
          checkout_request_id: checkoutRequestId,
          client_mac: clientMac || null,
          outcome: 'issued',
          details: { source: 'mpesa_poll' },
        }).then(() => {}, (e: unknown) => console.error('[session_events] insert failed', e));
      }

      // Fill in package details + bind the voucher to this device / transaction
      const { data: vrow } = await supabase
        .from('vouchers')
        .select('id, duration_hours, package_type, resume_token_hash, used_by_mac, transaction_id')
        .eq('code', code)
        .maybeSingle();

      if (vrow) {
        durationHours = durationHours ?? vrow.duration_hours;
        packageType = packageType ?? vrow.package_type;
        const patch: Record<string, unknown> = {};
        if (!vrow.used_by_mac && clientMac) patch.used_by_mac = clientMac;
        if (!vrow.transaction_id) patch.transaction_id = tx.id;
        if (Object.keys(patch).length) await supabase.from('vouchers').update(patch).eq('id', vrow.id);
      }

      // Layer 2 — silent resume token (mint once per voucher)
      let resumeToken: string | null = null;
      if (vrow && !vrow.resume_token_hash) {
        const minted = await mintResumeToken();
        await supabase.from('vouchers').update({ resume_token_hash: minted.hash }).eq('id', vrow.id);
        resumeToken = minted.token;
      }

      if (!tx.voucher_code) {
        await supabase.from('transactions').update({ voucher_code: code }).eq('id', tx.id);
      }

      return new Response(JSON.stringify({
        status: 'success',
        voucher: code,
        durationHours,
        packageType,
        paidAt: paidAtIso,
        revealAllowed: await revealAllowedFor(supabase, code!, paidAtIso),
        resumeToken,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ status: tx.status }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('portal-mpesa-poll error', e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});