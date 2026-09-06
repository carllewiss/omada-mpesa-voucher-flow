import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Issue a voucher immediately at payment confirmation time — NEVER wait for the
// customer's browser to poll. If the phone/browser dies, the voucher still exists
// and MAC / token resume can hand it back.
export async function issueVoucherForTransaction(supabase: any, checkoutRequestId: string) {
  const { data: tx } = await supabase
    .from('transactions')
    .select('id, package_type, client_mac, voucher_code')
    .eq('checkout_request_id', checkoutRequestId)
    .maybeSingle();
  if (!tx) return null;

  const { data: claimed, error } = await supabase.rpc('claim_voucher_for_transaction', {
    _transaction_id: tx.id,
    _package_type: tx.package_type,
    _client_mac: tx.client_mac || null,
  });

  if (error || !claimed || claimed.length === 0) {
    console.error('Voucher claim failed for', checkoutRequestId, error);
    supabase.from('session_events').insert({
      event_type: 'voucher_issue_failed',
      transaction_id: tx.id,
      checkout_request_id: checkoutRequestId,
      package_type: tx.package_type,
      client_mac: tx.client_mac,
      outcome: 'no_voucher_available',
    }).then(() => {}, () => {});
    return null;
  }

  const v = claimed[0];

  await supabase
    .from('client_authorizations')
    .update({
      payment_status: 'paid',
      mpesa_receipt: `VC-${v.code}`,
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
    client_mac: tx.client_mac,
    outcome: 'issued',
    details: { source: 'server_side_on_payment' },
  }).then(() => {}, () => {});

  return v;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    console.log('M-Pesa callback received:', JSON.stringify(body));

    const callback = body?.Body?.stkCallback;
    if (!callback) {
      return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: 'Accepted' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { CheckoutRequestID, ResultCode, ResultDesc } = callback;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (ResultCode === 0) {
      const items = callback.CallbackMetadata?.Item || [];
      const receipt = items.find((i: any) => i.Name === 'MpesaReceiptNumber')?.Value || '';

      await supabase
        .from('transactions')
        .update({
          status: 'success',
          mpesa_receipt: receipt,
          result_code: 0,
          result_desc: ResultDesc,
          updated_at: new Date().toISOString(),
        })
        .eq('checkout_request_id', CheckoutRequestID);

      const v = await issueVoucherForTransaction(supabase, CheckoutRequestID);
      console.log('Payment successful:', CheckoutRequestID, receipt, 'voucher:', v?.code ?? 'none');
    } else {
      await supabase
        .from('transactions')
        .update({
          status: ResultCode === 1032 ? 'cancelled' : 'failed',
          result_code: ResultCode,
          result_desc: ResultDesc,
          updated_at: new Date().toISOString(),
        })
        .eq('checkout_request_id', CheckoutRequestID);

      console.log('Payment failed:', CheckoutRequestID, ResultDesc);
    }

    return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: 'Accepted' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Callback error:', error);
    return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: 'Accepted' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
