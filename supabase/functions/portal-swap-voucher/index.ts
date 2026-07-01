// Portal: M-Pesa fallback — when Omada rejects the issued voucher, burn it
// and atomically claim a fresh voucher of the same package, guaranteeing
// the same MAC never receives the same voucher twice.
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
    const { checkoutRequestId, clientMac, rejectedCode } = await req.json();
    if (!checkoutRequestId || !rejectedCode) {
      return new Response(JSON.stringify({ error: 'checkoutRequestId and rejectedCode required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const startedAt = new Date().toISOString();
    console.log('[voucher-swap] request', { startedAt, checkoutRequestId, clientMac, rejectedCode });

    const { data, error } = await supabase.rpc('swap_voucher_for_mpesa', {
      _checkout_request_id: checkoutRequestId,
      _client_mac: clientMac || null,
      _rejected_code: rejectedCode,
    });

    if (error) {
      console.error('swap_voucher_for_mpesa error', error);
      await supabase.from('voucher_swaps').insert({
        checkout_request_id: checkoutRequestId,
        client_mac: clientMac || null,
        rejected_code: rejectedCode,
        new_code: null,
        package_type: null,
        status: 'error',
        reason: error.message,
      });
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!data || data.length === 0) {
      console.warn('[voucher-swap] no_voucher', { checkoutRequestId, clientMac, rejectedCode });
      await supabase.from('voucher_swaps').insert({
        checkout_request_id: checkoutRequestId,
        client_mac: clientMac || null,
        rejected_code: rejectedCode,
        new_code: null,
        package_type: null,
        status: 'no_voucher',
        reason: 'No alternative voucher available for this device',
      });
      return new Response(JSON.stringify({
        status: 'no_voucher',
        error: 'No alternative voucher available for this device. Please contact support — your payment is safe.',
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const v = data[0];
    console.log('[voucher-swap] success', {
      checkoutRequestId, clientMac, rejectedCode,
      newCode: v.code, packageType: v.package_type,
    });
    await supabase.from('voucher_swaps').insert({
      checkout_request_id: checkoutRequestId,
      client_mac: clientMac || null,
      rejected_code: rejectedCode,
      new_code: v.code,
      package_type: v.package_type,
      status: 'success',
      reason: 'Omada rejected previous voucher; fresh one issued',
    });
    return new Response(JSON.stringify({
      status: 'success',
      voucher: v.code,
      durationHours: v.duration_hours,
      packageType: v.package_type,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('portal-swap-voucher error', e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});