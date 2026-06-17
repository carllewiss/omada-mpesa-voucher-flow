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
    const { clientMac, phoneNumber } = await req.json().catch(() => ({}));
    if (!clientMac && !phoneNumber) {
      return new Response(JSON.stringify({ active: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    let row: any = null;

    if (clientMac) {
      const { data } = await supabase.rpc('resume_session_for_mac', { _client_mac: clientMac });
      if (Array.isArray(data) && data.length) row = data[0];
    }

    if (!row && phoneNumber) {
      const phone = normalizePhone(phoneNumber);
      const { data } = await supabase
        .from('transactions')
        .select('id, package_type, voucher_code, updated_at, vouchers!inner(code, package_type, duration_hours, used_at, status)')
        .eq('phone_number', phone)
        .in('status', ['success', 'paid'])
        .gt('updated_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order('updated_at', { ascending: false })
        .limit(1);
      if (data && data.length) {
        const t: any = data[0];
        const v = Array.isArray(t.vouchers) ? t.vouchers[0] : t.vouchers;
        if (v && ['reserved', 'used'].includes(v.status)) {
          row = {
            transaction_id: t.id,
            voucher_code: v.code,
            package_type: v.package_type,
            duration_hours: v.duration_hours,
            paid_at: t.updated_at,
          };
        }
      }
    }

    if (!row) {
      return new Response(JSON.stringify({ active: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

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