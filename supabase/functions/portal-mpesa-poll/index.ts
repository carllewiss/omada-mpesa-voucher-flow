// Portal: Poll payment status; on confirmed payment, atomically claim a voucher and return it.
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
      // If a voucher was already issued for this transaction, return it (idempotent)
      const { data: existingAuth } = await supabase
        .from('client_authorizations')
        .select('mpesa_receipt, package_type, duration_hours')
        .eq('checkout_request_id', checkoutRequestId)
        .maybeSingle();

      if (existingAuth?.mpesa_receipt && existingAuth.mpesa_receipt.startsWith('VC-')) {
        const code = existingAuth.mpesa_receipt.substring(3);
        return new Response(JSON.stringify({
          status: 'success', voucher: code,
          durationHours: existingAuth.duration_hours,
          packageType: existingAuth.package_type,
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Atomically claim ONE unused voucher for this package
      const { data: claimed, error: claimErr } = await supabase
        .rpc('claim_voucher_for_package', {
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

      await supabase
        .from('client_authorizations')
        .update({
          payment_status: 'paid',
          mpesa_receipt: `VC-${v.code}`,
          mac_address: clientMac || null,
          updated_at: new Date().toISOString(),
        })
        .eq('checkout_request_id', checkoutRequestId);

      return new Response(JSON.stringify({
        status: 'success',
        voucher: v.code,
        durationHours: v.duration_hours,
        packageType: v.package_type,
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