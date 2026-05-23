// Portal: Poll payment status.
// On confirmed payment, RESERVE (not consume) a voucher and return it.
// Voucher is only marked permanently 'used' after portal-confirm-auth confirms connectivity.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Map transactions.status -> portal state for the frontend state machine.
function toPortalStatus(s: string): string {
  switch (s) {
    case 'success':
    case 'paid':              return 'paid';
    case 'pending':           return 'pending';
    case 'cancelled':         return 'cancelled';
    case 'insufficient_funds':return 'insufficient_funds';
    case 'timeout':           return 'timeout';
    case 'invalid_pin':       return 'invalid_pin';
    case 'expired':           return 'expired';
    case 'failed':            return 'failed';
    default:                  return s;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { checkoutRequestId, clientMac, sessionId } = await req.json();
    if (!checkoutRequestId) {
      return new Response(JSON.stringify({ error: 'checkoutRequestId required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Best-effort: release any expired reservations back into the pool
    await supabase.rpc('release_expired_reservations');

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

    const mapped = toPortalStatus(tx.status);

    // Terminal failure states
    if (['failed','cancelled','insufficient_funds','timeout','invalid_pin','expired'].includes(mapped)) {
      // Release any voucher that may have been reserved for this transaction
      await supabase.rpc('release_voucher_for_transaction', { _transaction_id: tx.id });
      return new Response(JSON.stringify({
        status: mapped,
        error: tx.result_desc || 'Payment did not complete.',
        resultCode: tx.result_code,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (mapped === 'pending') {
      return new Response(JSON.stringify({ status: 'pending' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (mapped === 'paid') {
      // Reserve a voucher (idempotent — returns the same one if already reserved/used for this tx)
      const { data: reserved, error: resErr } = await supabase.rpc('reserve_voucher_for_transaction', {
        _transaction_id: tx.id,
        _package_type:   tx.package_type,
        _client_mac:     clientMac || tx.client_mac || null,
        _session_id:     sessionId  || tx.session_id || null,
        _hold_minutes:   10,
      });

      if (resErr || !reserved || reserved.length === 0) {
        return new Response(JSON.stringify({
          status: 'no_voucher',
          error: 'Payment received but no vouchers are currently available. Please contact support — your money is safe.',
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const v = reserved[0];

      await supabase.from('transactions')
        .update({
          voucher_code: v.code,
          client_mac: clientMac || tx.client_mac || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', tx.id);

      await supabase
        .from('client_authorizations')
        .update({
          payment_status: 'paid',
          mpesa_receipt: `VC-${v.code}`,
          mac_address: clientMac || tx.client_mac || null,
          updated_at: new Date().toISOString(),
        })
        .eq('checkout_request_id', checkoutRequestId);

      return new Response(JSON.stringify({
        status: 'paid',
        voucher: v.code,
        durationHours: v.duration_hours,
        packageType: v.package_type,
        transactionId: tx.id,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ status: mapped }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('portal-mpesa-poll error', e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});