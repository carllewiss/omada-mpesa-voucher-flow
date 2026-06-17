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

    // LAYER 4 — Pre-payment guard: block STK Push if this MAC/phone already
    // has an active voucher (paid <24h ago, not yet expired). Prevents double
    // payment when the customer paid but their device failed to connect.
    async function findActiveSession() {
      if (clientMac) {
        const { data } = await supabase.rpc('resume_session_for_mac', { _client_mac: clientMac });
        if (Array.isArray(data) && data.length) return data[0];
      }
      const { data: rows } = await supabase
        .from('transactions')
        .select('id, updated_at, vouchers!inner(code, package_type, duration_hours, status)')
        .eq('phone_number', formattedPhone)
        .in('status', ['success', 'paid'])
        .gt('updated_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order('updated_at', { ascending: false })
        .limit(1);
      if (rows && rows.length) {
        const t: any = rows[0];
        const v = Array.isArray(t.vouchers) ? t.vouchers[0] : t.vouchers;
        if (v && ['reserved', 'used'].includes(v.status)) {
          return {
            transaction_id: t.id,
            voucher_code: v.code,
            package_type: v.package_type,
            duration_hours: v.duration_hours,
            paid_at: t.updated_at,
          };
        }
      }
      return null;
    }

    const active = await findActiveSession();
    if (active) {
      const paidAt = new Date(active.paid_at).getTime();
      const expiresAt = paidAt + (active.duration_hours || 2) * 60 * 60 * 1000;
      if (expiresAt > Date.now()) {
        return new Response(JSON.stringify({
          success: false,
          alreadyActive: true,
          voucher: active.voucher_code,
          packageType: active.package_type,
          durationHours: active.duration_hours,
          expiresAt: new Date(expiresAt).toISOString(),
          message: `You already have an active ${active.duration_hours}-hour package. Reconnecting…`,
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
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

    // Persist transaction tied to sessionId, with the SERVER-DECIDED amount/package
    await supabase.from('transactions').insert({
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
    });

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