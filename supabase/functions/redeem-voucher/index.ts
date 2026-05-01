import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { code, clientMac, clientIp, apMac, ssid, phoneNumber } = await req.json();

    if (!code || typeof code !== 'string' || code.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'Voucher code is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Check if voucher exists and is unused
    const { data: voucher, error: fetchError } = await supabase
      .from('vouchers')
      .select('*')
      .eq('code', code.trim())
      .single();

    if (fetchError || !voucher) {
      return new Response(JSON.stringify({ error: 'Voucher code not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (voucher.status !== 'unused') {
      return new Response(JSON.stringify({ error: 'Voucher code has already been used' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Update voucher to used
    const { error: updateError } = await supabase
      .from('vouchers')
      .update({
        status: 'used',
        used_by_mac: clientMac || null,
        used_at: new Date().toISOString(),
      })
      .eq('id', voucher.id);

    if (updateError) {
      console.error('Failed to update voucher:', updateError);
      return new Response(JSON.stringify({ error: 'Failed to redeem voucher' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Insert into client_authorizations for the Node.js agent to pick up
    const { error: insertError } = await supabase
      .from('client_authorizations')
      .insert({
        mac_address: clientMac || null,
        client_ip: clientIp || null,
        ap_mac: apMac || null,
        ssid: ssid || null,
        phone_number: phoneNumber || 'voucher-user',
        amount: 0,
        package_type: voucher.package_type,
        duration_hours: voucher.duration_hours,
        payment_status: 'paid',
        authorization_status: 'no',
        mpesa_receipt: `VOUCHER-${voucher.code}`,
      });

    if (insertError) {
      console.error('Failed to insert authorization:', insertError);
      return new Response(JSON.stringify({ error: 'Failed to create authorization record' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      voucher: {
        code: voucher.code,
        package_type: voucher.package_type,
        duration_hours: voucher.duration_hours,
      },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error redeeming voucher:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
