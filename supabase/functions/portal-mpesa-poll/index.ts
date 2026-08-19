// Portal: Poll payment status; on confirmed payment, atomically claim a voucher and return it.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Layer 2 helper — generate a random URL-safe token and its sha-256 hash.
async function mintResumeToken(): Promise<{ token: string; hash: string }> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const token = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  const hash = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0')).join('');
  return { token, hash };
}

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
        // Idempotent path: only mint a resume token if the voucher doesn't already have one.
        let resumeToken: string | null = null;
        const { data: vrow } = await supabase
          .from('vouchers')
          .select('id, resume_token_hash')
          .eq('code', code)
          .maybeSingle();
        if (vrow && !vrow.resume_token_hash) {
          const minted = await mintResumeToken();
          await supabase.from('vouchers')
            .update({ resume_token_hash: minted.hash })
            .eq('id', vrow.id);
          resumeToken = minted.token;
        }
        return new Response(JSON.stringify({
          status: 'success', voucher: code,
          durationHours: existingAuth.duration_hours,
          packageType: existingAuth.package_type,
          paidAt: tx.updated_at || tx.created_at || new Date().toISOString(),
          resumeToken,
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

      // Accounting log: first issuance of this voucher for this transaction.
      supabase.from('session_events').insert({
        event_type: 'voucher_issued',
        voucher_code: v.code,
        package_type: v.package_type,
        duration_hours: v.duration_hours,
        transaction_id: tx.id,
        checkout_request_id: checkoutRequestId,
        client_mac: clientMac || null,
        outcome: 'issued',
        details: { source: 'mpesa_poll' },
      }).then(() => {}, (e: unknown) => console.error('[session_events] insert failed', e));

      // Layer 2 — mint silent resume token bound to this voucher row.
      const minted = await mintResumeToken();
      await supabase.from('vouchers')
        .update({ resume_token_hash: minted.hash })
        .eq('code', v.code);

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
        paidAt: tx.updated_at || tx.created_at || new Date().toISOString(),
        resumeToken: minted.token,
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