import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.3';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    console.log('M-Pesa callback received:', JSON.stringify(body));

    const callback = body?.Body?.stkCallback;
    if (!callback) {
      return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: 'Accepted' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { MerchantRequestID, CheckoutRequestID, ResultCode, ResultDesc } = callback;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (ResultCode === 0) {
      // Payment successful - extract receipt number
      const items = callback.CallbackMetadata?.Item || [];
      const receipt = items.find((i: any) => i.Name === 'MpesaReceiptNumber')?.Value || '';

      await supabase
        .from('transactions')
        .update({
          status: 'success',
          mpesa_receipt: receipt,
          result_desc: ResultDesc,
          updated_at: new Date().toISOString(),
        })
        .eq('checkout_request_id', CheckoutRequestID);

      console.log('Payment successful:', CheckoutRequestID, receipt);
    } else {
      // Payment failed or cancelled
      await supabase
        .from('transactions')
        .update({
          status: ResultCode === 1032 ? 'cancelled' : 'failed',
          result_desc: ResultDesc,
          updated_at: new Date().toISOString(),
        })
        .eq('checkout_request_id', CheckoutRequestID);

      console.log('Payment failed:', CheckoutRequestID, ResultDesc);
    }

    return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: 'Accepted' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Callback error:', error);
    return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: 'Accepted' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
