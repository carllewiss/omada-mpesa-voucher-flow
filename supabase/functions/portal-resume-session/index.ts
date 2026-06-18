// Portal: Layer 1 auto-resume
// Looks up the most recent active voucher for a client MAC (or phone) in the last 24h.
// If found, the portal silently re-submits it to Omada — no new payment needed.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.3';

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    // Resume is strictly per-device (MAC). One phone number can pay for
    // multiple devices, so phone-based resume would re-attach the wrong
    // device's voucher. Always require clientMac.
    const { clientMac } = await req.json().catch(() => ({}));
    if (!clientMac) {
      return new Response(JSON.stringify({ active: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
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
      return new Response(JSON.stringify({ active: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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