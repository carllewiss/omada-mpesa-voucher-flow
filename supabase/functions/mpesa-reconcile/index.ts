// Safety net: sweeps every pending M-Pesa transaction, asks Daraja what happened,
// finalises it and issues the voucher server-side. Runs on a schedule (pg_cron)
// so a payment is NEVER left pending just because the customer's browser closed.
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

async function issueVoucher(supabase: any, tx: any) {
  const { data: claimed, error } = await supabase.rpc('claim_voucher_for_transaction', {
    _transaction_id: tx.id,
    _package_type: tx.package_type,
    _client_mac: tx.client_mac || null,
  });
  if (error || !claimed?.length) {
    supabase.from('session_events').insert({
      event_type: 'voucher_issue_failed',
      transaction_id: tx.id,
      checkout_request_id: tx.checkout_request_id,
      package_type: tx.package_type,
      client_mac: tx.client_mac,
      outcome: 'no_voucher_available',
      details: { source: 'reconcile' },
    }).then(() => {}, () => {});
    return null;
  }
  const v = claimed[0];
  await supabase.from('client_authorizations').update({
    payment_status: 'paid',
    mpesa_receipt: `VC-${v.code}`,
    updated_at: new Date().toISOString(),
  }).eq('checkout_request_id', tx.checkout_request_id);
  supabase.from('session_events').insert({
    event_type: 'voucher_issued',
    voucher_code: v.code,
    package_type: v.package_type,
    duration_hours: v.duration_hours,
    transaction_id: tx.id,
    checkout_request_id: tx.checkout_request_id,
    client_mac: tx.client_mac,
    outcome: 'issued',
    details: { source: 'reconcile' },
  }).then(() => {}, () => {});
  return v;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const summary = { checked: 0, confirmed: 0, failed: 0, stillPending: 0, vouchersIssued: 0 };

  try {
    // 1. Pending payments older than 60s but younger than 6h
    const { data: pending } = await supabase
      .from('transactions')
      .select('id, checkout_request_id, package_type, client_mac, created_at')
      .eq('status', 'pending')
      .lt('created_at', new Date(Date.now() - 60_000).toISOString())
      .gt('created_at', new Date(Date.now() - 6 * 60 * 60_000).toISOString())
      .limit(50);

    if (pending?.length) {
      const token = await getAccessToken();
      for (const tx of pending) {
        if (!tx.checkout_request_id) continue;
        summary.checked++;
        const now = new Date();
        const ts = now.getFullYear().toString() +
          String(now.getMonth() + 1).padStart(2, '0') +
          String(now.getDate()).padStart(2, '0') +
          String(now.getHours()).padStart(2, '0') +
          String(now.getMinutes()).padStart(2, '0') +
          String(now.getSeconds()).padStart(2, '0');
        const password = btoa(`${MPESA_SHORTCODE}${MPESA_PASSKEY}${ts}`);

        const r = await fetch(`${MPESA_API_URL}/mpesa/stkpushquery/v1/query`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            BusinessShortCode: MPESA_SHORTCODE,
            Password: password,
            Timestamp: ts,
            CheckoutRequestID: tx.checkout_request_id,
          }),
        });
        const q = await r.json();

        if (q.errorCode) { summary.stillPending++; continue; }

        const resultCode = String(q.ResultCode ?? '');
        if (resultCode === '0') {
          await supabase.from('transactions').update({
            status: 'success',
            result_code: 0,
            result_desc: q.ResultDesc || 'Confirmed via reconciliation',
            updated_at: new Date().toISOString(),
          }).eq('id', tx.id);
          summary.confirmed++;
          if (await issueVoucher(supabase, tx)) summary.vouchersIssued++;
        } else {
          await supabase.from('transactions').update({
            status: resultCode === '1032' ? 'cancelled' : 'failed',
            result_code: Number(resultCode) || null,
            result_desc: q.ResultDesc || 'Failed via reconciliation',
            updated_at: new Date().toISOString(),
          }).eq('id', tx.id);
          summary.failed++;
        }
      }
    }

    // 2. Paid transactions that somehow have no voucher yet (last 24h)
    const { data: orphans } = await supabase
      .from('transactions')
      .select('id, checkout_request_id, package_type, client_mac')
      .in('status', ['success', 'paid'])
      .is('voucher_code', null)
      .gt('created_at', new Date(Date.now() - 24 * 60 * 60_000).toISOString())
      .limit(50);

    for (const tx of orphans || []) {
      if (await issueVoucher(supabase, tx)) summary.vouchersIssued++;
    }

    console.log('reconcile summary', JSON.stringify(summary));
    return new Response(JSON.stringify({ ok: true, ...summary }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('mpesa-reconcile error', e);
    return new Response(JSON.stringify({ error: (e as Error).message, ...summary }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
