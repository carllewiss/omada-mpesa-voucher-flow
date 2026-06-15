// M-Pesa STK Push Query — fail-safe when Safaricom's async callback never arrives.
// Asks Daraja directly: "what happened to this CheckoutRequestID?"
// On confirmed success it marks the transaction the SAME way mpesa-callback does,
// so the existing portal-mpesa-poll path will then claim a voucher and return it.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

const MPESA_CONSUMER_KEY = Deno.env.get('MPESA_CONSUMER_KEY')!;
const MPESA_CONSUMER_SECRET = Deno.env.get('MPESA_CONSUMER_SECRET')!;
const MPESA_PASSKEY = Deno.env.get('MPESA_PASSKEY')!;
const MPESA_SHORTCODE = Deno.env.get('MPESA_SHORTCODE')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const MPESA_API_URL = 'https://api.safaricom.co.ke';

async function getAccessToken(): Promise<string> {
  const credentials = btoa(`${MPESA_CONSUMER_KEY}:${MPESA_CONSUMER_SECRET}`);
  const res = await fetch(`${MPESA_API_URL}/oauth/v1/generate?grant_type=client_credentials`, {
    headers: { Authorization: `Basic ${credentials}` },
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('Failed to get M-Pesa access token');
  return data.access_token;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { checkoutRequestId } = await req.json();
    if (!checkoutRequestId) {
      return new Response(JSON.stringify({ error: 'checkoutRequestId required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Short-circuit if the callback already finalised this transaction.
    const { data: tx } = await supabase
      .from('transactions')
      .select('status, checkout_request_id')
      .eq('checkout_request_id', checkoutRequestId)
      .maybeSingle();

    if (tx && tx.status && tx.status !== 'pending') {
      return new Response(JSON.stringify({ status: tx.status, source: 'db' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Build Daraja STK Query payload
    const now = new Date();
    const ts = now.getFullYear().toString() +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0') +
      String(now.getHours()).padStart(2, '0') +
      String(now.getMinutes()).padStart(2, '0') +
      String(now.getSeconds()).padStart(2, '0');
    const password = btoa(`${MPESA_SHORTCODE}${MPESA_PASSKEY}${ts}`);

    const token = await getAccessToken();
    const r = await fetch(`${MPESA_API_URL}/mpesa/stkpushquery/v1/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        BusinessShortCode: MPESA_SHORTCODE,
        Password: password,
        Timestamp: ts,
        CheckoutRequestID: checkoutRequestId,
      }),
    });
    const q = await r.json();
    console.log('STK Query response:', JSON.stringify(q));

    // Daraja errorCode 500.001.1001 = "transaction is being processed" — still pending.
    if (q.errorCode) {
      return new Response(JSON.stringify({ status: 'pending', mpesa: q }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const resultCode = String(q.ResultCode ?? '');
    if (resultCode === '0') {
      // Mirror mpesa-callback: mark success. The next portal-mpesa-poll tick
      // will claim a voucher and return it to the customer.
      await supabase
        .from('transactions')
        .update({
          status: 'success',
          result_desc: q.ResultDesc || 'Confirmed via STK Query',
          result_code: 0,
          updated_at: new Date().toISOString(),
        })
        .eq('checkout_request_id', checkoutRequestId);

      return new Response(JSON.stringify({ status: 'success', source: 'stk_query' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Anything other than 0 = terminal failure (cancelled, timeout, insufficient funds...)
    const newStatus = resultCode === '1032' ? 'cancelled' : 'failed';
    await supabase
      .from('transactions')
      .update({
        status: newStatus,
        result_desc: q.ResultDesc || 'Failed via STK Query',
        result_code: Number(resultCode) || null,
        updated_at: new Date().toISOString(),
      })
      .eq('checkout_request_id', checkoutRequestId);

    return new Response(JSON.stringify({ status: newStatus, source: 'stk_query', mpesa: q }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('mpesa-stk-query error', e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});