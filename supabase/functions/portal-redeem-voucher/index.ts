// Portal: Validate a manually-entered voucher (case-sensitive) and atomically mark used.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { code, clientMac, apMac, ssid } = await req.json();
    if (!code || typeof code !== 'string') {
      return new Response(JSON.stringify({ success: false, error: 'Voucher code required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const trimmed = code.trim();
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Atomic claim: only the row matching this exact code AND still unused
    const { data: rows, error } = await supabase
      .from('vouchers')
      .update({
        status: 'used',
        is_used: true,
        used_at: new Date().toISOString(),
        used_by_mac: clientMac || null,
      })
      .eq('code', trimmed)
      .eq('is_used', false)
      .select('code, package_type, duration_hours');

    if (error) throw error;
    if (!rows || rows.length === 0) {
      return new Response(JSON.stringify({
        success: false, error: 'Voucher is invalid, already used, or expired.',
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const v = rows[0];

    await supabase.from('client_authorizations').insert({
      mac_address: clientMac || null,
      ap_mac: apMac || null,
      ssid: ssid || null,
      phone_number: 'voucher',
      amount: 0,
      package_type: v.package_type,
      duration_hours: v.duration_hours,
      payment_status: 'paid',
      authorization_status: 'no',
      mpesa_receipt: `VC-${v.code}`,
    });

    return new Response(JSON.stringify({
      success: true,
      voucher: { code: v.code, duration_hours: v.duration_hours, package_type: v.package_type },
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('portal-redeem-voucher error', e);
    return new Response(JSON.stringify({ success: false, error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});