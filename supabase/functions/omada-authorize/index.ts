// Server-side Omada authorization — used as a BACKUP when the browser's
// voucher auto-submit to /portal/auth fails.
//
// Flow (Omada v5/v6 Web API):
//   1. GET  /api/info                          -> omadacId
//   2. POST /{cid}/api/v2/login                -> token + session cookie
//   3. POST /{cid}/api/v2/hotspot/extPortal/auth
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const OMADA_URL = (Deno.env.get('OMADA_URL') ?? '').replace(/\/+$/, '');
const OMADA_USERNAME = Deno.env.get('OMADA_USERNAME') ?? '';
const OMADA_PASSWORD = Deno.env.get('OMADA_PASSWORD') ?? '';
const OMADA_SITE = Deno.env.get('OMADA_SITE') ?? 'Default';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

async function logEvent(type: string, payload: Record<string, unknown>) {
  try {
    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    await sb.from('session_events').insert({
      event_type: type,
      client_mac: (payload.clientMac as string) ?? null,
      details: payload,
    });
  } catch (_) { /* logging must never break auth */ }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  if (!OMADA_URL || !OMADA_USERNAME || !OMADA_PASSWORD) {
    return json({ authorized: false, error: 'Controller not configured' }, 500);
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const clientMac = String(body.clientMac ?? '').trim();
  const apMac = String(body.apMac ?? '').trim();
  const ssidName = String(body.ssidName ?? '').trim();
  const radioId = Number(body.radioId ?? 0);
  const durationHours = Number(body.durationHours ?? 2);

  if (!/^[0-9A-Fa-f]{2}([:-][0-9A-Fa-f]{2}){5}$/.test(clientMac)) {
    return json({ authorized: false, error: 'Invalid clientMac' }, 400);
  }
  if (!(durationHours > 0 && durationHours <= 720)) {
    return json({ authorized: false, error: 'Invalid duration' }, 400);
  }

  try {
    // 1. Controller id
    const infoRes = await fetch(`${OMADA_URL}/api/info`);
    const info = await infoRes.json();
    const cid = info?.result?.omadacId;
    if (!cid) throw new Error('Could not read controller id');

    // 2. Login
    const loginRes = await fetch(`${OMADA_URL}/${cid}/api/v2/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: OMADA_USERNAME, password: OMADA_PASSWORD }),
    });
    const login = await loginRes.json();
    if (login?.errorCode !== 0) throw new Error(login?.msg || 'Controller login failed');
    const token = login.result.token;
    const cookie = loginRes.headers.get('set-cookie')?.split(';')[0] ?? '';

    // 3. Authorize the client MAC directly
    const authRes = await fetch(`${OMADA_URL}/${cid}/api/v2/hotspot/extPortal/auth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Csrf-Token': token,
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: JSON.stringify({
        clientMac,
        apMac: apMac || undefined,
        ssidName: ssidName || undefined,
        radioId: Number.isFinite(radioId) ? radioId : 0,
        site: OMADA_SITE,
        authType: 4, // external portal authorization
        time: durationHours * 60 * 60 * 1000,
      }),
    });
    const auth = await authRes.json();

    if (auth?.errorCode === 0) {
      await logEvent('server_side_auth_success', { clientMac, apMac, ssidName, durationHours });
      return json({ authorized: true });
    }

    await logEvent('server_side_auth_failed', { clientMac, error: auth?.msg, code: auth?.errorCode });
    return json({ authorized: false, error: auth?.msg || 'Controller rejected authorization' }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    await logEvent('server_side_auth_error', { clientMac, error: msg });
    return json({ authorized: false, error: msg }, 200);
  }
});
