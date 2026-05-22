// Portal: Initiate M-Pesa STK Push
// SECURITY: amount is decided server-side from package_pricing — frontend "price" is ignored.
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
    const { phoneNumber, packageType, sessionId, clientMac, apMac, ssid } = await req.json();

    if (!phoneNumber || !packageType || !sessionId) {
      return new Response(JSON.stringify({ error: 'phoneNumber, packageType, sessionId are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // SERVER-DECIDED PRICE — never trust the client
    const { data: pkg, error: pkgErr } = await supabase
      .from('package_pricing')
      .select('price_kes, duration_hours, display_name')
      .eq('package_type', packageType)
      .single();

    if (pkgErr || !pkg) {
      return new Response(JSON.stringify({ error: 'Unknown package' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const amount = Number(pkg.price_kes);
    const formattedPhone = normalizePhone(phoneNumber);
    if (formattedPhone.length < 12) {
      return new Response(JSON.stringify({ error: 'Invalid phone number' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = await getAccessToken();
    const now = new Date();
    const ts = now.getFullYear().toString() +
      String(now.getMonth() + 1).padStart(2, '0') +
      String(now.getDate()).padStart(2, '0') +
      String(now.getHours()).padStart(2, '0') +
      String(now.getMinutes()).padStart(2, '0') +
      String(now.getSeconds()).padStart(2, '0');
    const password = btoa(`${MPESA_SHORTCODE}${MPESA_PASSKEY}${ts}`);

    const callbackUrl = `${SUPABASE_URL}/functions/v1/mpesa-callback`;

    const stkRes = await fetch(`${MPESA_API_URL}/mpesa/stkpush/v1/processrequest`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        BusinessShortCode: MPESA_SHORTCODE,
        Password: password,
        Timestamp: ts,
        TransactionType: 'CustomerPayBillOnline',
        Amount: amount,
        PartyA: formattedPhone,
        PartyB: MPESA_SHORTCODE,
        PhoneNumber: formattedPhone,
        CallBackURL: callbackUrl,
        AccountReference: '4KSMART',
        TransactionDesc: `WiFi ${packageType}`,
      }),
    });
    const stk = await stkRes.json();

    if (stk.ResponseCode !== '0') {
      return new Response(JSON.stringify({
        success: false, error: stk.errorMessage || stk.ResponseDescription || 'STK push failed',
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Persist transaction tied to sessionId + client MAC.
    // MAC is the IDENTITY for authentication — phone is just the payment instrument.
    const { data: txRow } = await supabase.from('transactions').insert({
      phone_number: formattedPhone,
      amount,
      package_type: packageType,
      checkout_request_id: stk.CheckoutRequestID,
      merchant_request_id: stk.MerchantRequestID,
      status: 'pending',
      session_id: sessionId,
      client_mac: clientMac || null,
      ap_mac: apMac || null,
      ssid: ssid || null,
    }).select('id').single();

    // Pending authorization row — voucher will be claimed on poll once paid
    await supabase.from('client_authorizations').insert({
      mac_address: clientMac || null,
      ap_mac: apMac || null,
      ssid: ssid || null,
      phone_number: formattedPhone,
      amount,
      package_type: packageType,
      duration_hours: pkg.duration_hours,
      payment_status: 'pending',
      authorization_status: 'no',
      checkout_request_id: stk.CheckoutRequestID,
    });

    return new Response(JSON.stringify({
      success: true,
      checkoutRequestId: stk.CheckoutRequestID,
      transactionId: txRow?.id,
      sessionId,
      amount,
      package: pkg.display_name,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('portal-mpesa-initiate error', e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});