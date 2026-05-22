// Portal: If a device's browser crashed mid-flow, calling this with its MAC
// returns any recent paid voucher so it can re-authenticate without paying again.
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
    const { clientMac } = await req.json();
    if (!clientMac) {
      return new Response(JSON.stringify({ found: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data, error } = await supabase.rpc('resume_session_for_mac', { _client_mac: clientMac });
    if (error || !data || data.length === 0) {
      return new Response(JSON.stringify({ found: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const row = data[0];
    return new Response(JSON.stringify({
      found: true,
      transactionId: row.transaction_id,
      voucher: row.voucher_code,
      packageType: row.package_type,
      durationHours: row.duration_hours,
      alreadyAuthenticated: row.authenticated,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});