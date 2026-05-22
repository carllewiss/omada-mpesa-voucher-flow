// Portal: Frontend calls this AFTER it has verified real internet connectivity
// (Omada /portal/auth success + a probe like /generate_204).
// We then permanently mark the reserved voucher as used.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { transactionId, clientMac } = await req.json();
    if (!transactionId) {
      return new Response(JSON.stringify({ error: 'transactionId required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data, error } = await supabase.rpc('confirm_voucher_used', {
      _transaction_id: transactionId,
      _client_mac: clientMac || null,
    });
    if (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    await supabase.from('client_authorizations')
      .update({ authorization_status: 'yes', updated_at: new Date().toISOString() })
      .eq('checkout_request_id',
        (await supabase.from('transactions').select('checkout_request_id').eq('id', transactionId).maybeSingle()).data?.checkout_request_id || '');
    return new Response(JSON.stringify({ ok: true, confirmed: !!data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});