/* 4K Smart Solutions — Omada Internal Portal frontend
 * - Vouchers: validated DIRECTLY by Omada (/portal/auth, authType=3). No Supabase call.
 * - M-Pesa: hits Supabase Edge Functions; on success, the issued voucher is auto-submitted to Omada.
 * - After Omada confirms auth, show "Connected" screen with package + countdown, then redirect.
 */
(() => {
  'use strict';

  const SUPABASE_URL = 'https://tyqcalkdvsmeczbbqfns.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR5cWNhbGtkdnNtZWN6YmJxZm5zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3NDUxNTYsImV4cCI6MjA4NjMyMTE1Nn0.VTgZPClT7Te2R-9Y6zvtVyDj6pVWRvX7svvvLSx3fcw';
  const FN = (n) => `${SUPABASE_URL}/functions/v1/${n}`;

  // Omada URL params
  const qs = new URLSearchParams(window.location.search);
  const clientMac  = qs.get('clientMac')  || '';
  const apMac      = qs.get('apMac')      || '';
  const gatewayMac = qs.get('gatewayMac') || '';
  const ssidName   = qs.get('ssidName')   || '';
  const radioId    = qs.get('radioId')    || '';
  const vid        = qs.get('vid')        || '';
  const originUrl  = qs.get('originUrl')  || '';

  const sessionId = (crypto.randomUUID && crypto.randomUUID()) ||
    (Date.now() + '-' + Math.random().toString(36).slice(2));

  // LAYER 2 — silent resume token storage (per SSID, per browser).
  const RESUME_KEY = `4ksmart_resume_${ssidName || 'default'}`;
  const getResumeToken = () => {
    try { return localStorage.getItem(RESUME_KEY) || ''; } catch { return ''; }
  };
  const setResumeToken = (t) => {
    try { if (t) localStorage.setItem(RESUME_KEY, t); } catch {}
  };
  const clearResumeToken = () => {
    try { localStorage.removeItem(RESUME_KEY); } catch {}
  };

  const PACKAGES = [
    { id: '2hour',  name: '2-Hour Package',  duration: '2 Hours',  price: 10 },
    { id: '24hour', name: '24-Hour Package', duration: '24 Hours', price: 30 },
  ];
  let selected = PACKAGES[0];
  // Tracks the package label used for the connected screen (set when M-Pesa succeeds OR voucher redeems)
  let connectedPackageLabel = '';
  // Tracks the active M-Pesa checkout so we can swap a rejected voucher for a fresh one
  let activeCheckoutRequestId = '';

  const $ = (id) => document.getElementById(id);
  const setHint = (msg, ok) => {
    const el = $('hint');
    if (!msg) { el.style.display = 'none'; return; }
    el.className = 'alert' + (ok ? ' ok' : '');
    el.textContent = msg;
    el.style.display = 'block';
  };

  async function call(fnName, body) {
    const res = await fetch(FN(fnName), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(body || {}),
    });
    let data; try { data = await res.json(); } catch { data = {}; }
    return { ok: res.ok, status: res.status, data };
  }

  function renderPackages() {
    const root = $('packages');
    root.innerHTML = PACKAGES.map(p => `
      <button type="button" class="pkg ${p.id === selected.id ? 'active' : ''}" data-id="${p.id}">
        <div class="check">✓</div>
        <div class="price">KSh ${p.price}</div>
        <div class="name">${p.name}</div>
        <div class="dur">⏱ ${p.duration}</div>
      </button>`).join('');
    root.querySelectorAll('.pkg').forEach(el => {
      el.addEventListener('click', () => {
        selected = PACKAGES.find(p => p.id === el.dataset.id);
        renderPackages();
        $('pay-btn-text').textContent = `Pay KSh ${selected.price} — ${selected.name}`;
      });
    });
  }

  // ---------- Omada direct auth (vouchers + post-payment) ----------
  // Submits voucher straight to the controller's Internal Portal endpoint.
  // Returns: { ok: true } on success, { ok: false, error, code } otherwise.
  async function omadaVoucherAuth(voucher) {
    // Mirror values to the hidden form (debug + fallback submit)
    $('voucherCode').value = voucher;
    $('cMac').value  = clientMac;
    $('aMac').value  = apMac;
    $('gMac').value  = gatewayMac;
    $('sName').value = ssidName;
    $('rId').value   = radioId;
    $('vId').value   = vid;
    $('oUrl').value  = originUrl;

    const payload = {
      authType: 3, // VOUCHER
      voucherCode: voucher,
      clientMac, apMac, gatewayMac, ssidName,
      radioId: radioId ? Number(radioId) : undefined,
      vid: vid ? Number(vid) : undefined,
      originUrl,
    };

    try {
      const r = await fetch('/portal/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const res = await r.json().catch(() => ({}));
      if (res && res.errorCode === 0) return { ok: true, result: res.result };
      return { ok: false, error: res && (res.msg || res.errorMessage), code: res && res.errorCode };
    } catch (e) {
      return { ok: false, error: 'Network error contacting controller' };
    }
  }


  // ---------- Voucher reveal (conditional, 6 minutes after confirmed payment) ----------
  // Anti-sharing model:
  //  (1) Vouchers are limited to 1 device in Omada, so a shared code is rejected.
  //  (2) CONDITIONAL: the card is only rendered if auto-authentication FAILED.
  //      A customer who connects normally never sees the code at all.
  //  (4) SERVER-GATED: the backend must return revealAllowed === true. It refuses
  //      outside the 6-minute window and when the code shows sharing abuse.
  const REVEAL_WINDOW_MS = 6 * 60 * 1000;
  let revealInterval = null;
  let pendingReveal = null; // { code, paidAt, allowed } — only shown if auto-auth fails

  function armVoucherReveal(code, paidAtIso, allowed) {
    pendingReveal = allowed && code && paidAtIso ? { code, paidAtIso } : null;
  }

  function revealIfArmed() {
    if (!pendingReveal) return;
    const { code, paidAtIso } = pendingReveal;
    pendingReveal = null;
    showVoucherReveal(code, paidAtIso);
  }

  function showVoucherReveal(code, paidAtIso) {
    if (!code || !paidAtIso) return;
    const paidAt = new Date(paidAtIso).getTime();
    if (!paidAt || Number.isNaN(paidAt)) return;
    if (Date.now() - paidAt >= REVEAL_WINDOW_MS) return;


    const card = $('reveal-card');
    $('reveal-code').textContent = code;
    card.style.display = '';

    const tick = () => {
      const left = REVEAL_WINDOW_MS - (Date.now() - paidAt);
      if (left <= 0) {
        clearInterval(revealInterval); revealInterval = null;
        card.style.display = 'none';
        return;
      }
      const m = Math.floor(left / 60000);
      const sec = Math.floor((left % 60000) / 1000);
      $('reveal-timer').textContent = m + ':' + String(sec).padStart(2, '0');
    };
    tick();
    if (revealInterval) clearInterval(revealInterval);
    revealInterval = setInterval(tick, 1000);

    $('reveal-copy').onclick = async () => {
      try { await navigator.clipboard.writeText(code); $('reveal-copy').textContent = 'Copied'; }
      catch { $('reveal-copy').textContent = 'Copy failed'; }
      setTimeout(() => { $('reveal-copy').textContent = 'Copy'; }, 1800);
    };
  }

  // ---------- Overlays ----------
  let countdownInterval = null;
  let pollInterval = null;
  let connectedInterval = null;

  function showOverlay(id) { const el = $(id); el.classList.add('show'); el.setAttribute('aria-hidden', 'false'); }
  function hideOverlay(id) { const el = $(id); el.classList.remove('show'); el.setAttribute('aria-hidden', 'true'); }

  function startPaymentOverlay(phone, total = 90) {
    $('pay-phone').textContent = phone;
    $('timer').textContent = total;
    $('timer-bar-fill').style.width = '100%';
    showOverlay('payment-overlay');
    let left = total;
    countdownInterval = setInterval(() => {
      left -= 1;
      $('timer').textContent = Math.max(0, left);
      $('timer-bar-fill').style.width = ((left / total) * 100) + '%';
      if (left <= 0) {
        stopPaymentFlow();
        setHint('Payment timed out. Check your SMS — the code may still arrive.');
      }
    }, 1000);
  }

  function stopPaymentFlow() {
    if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
    if (pollInterval)      { clearInterval(pollInterval);      pollInterval = null; }
    hideOverlay('payment-overlay');
    $('pay-btn').disabled = false;
  }

  // M-Pesa flow: try the issued voucher; if Omada rejects it, silently burn it
  // server-side and request a fresh voucher (never one this MAC has already
  // received). All swaps happen behind the existing success animation — the
  // customer never sees retry chatter.
  async function showSuccessThenAuth(code) {
    const MAX_SWAPS = 2;
    $('success-code').textContent = code;
    hideOverlay('payment-overlay');
    showOverlay('success-overlay');

    let currentCode = code;
    let attempt = 0;
    await new Promise((res) => setTimeout(res, 900));

    while (true) {
      const r = await omadaVoucherAuth(currentCode);
      if (r.ok) {
        hideOverlay('success-overlay');
        showConnected(connectedPackageLabel || selected.name, r.result);
        return;
      }

      if (attempt >= MAX_SWAPS || !activeCheckoutRequestId) {
        hideOverlay('success-overlay');
        revealIfArmed();
        setHint('Could not connect you automatically. Use the code shown below to log in manually.');
        return;
      }

      attempt += 1;

      const { ok, data } = await call('portal-swap-voucher', {
        checkoutRequestId: activeCheckoutRequestId,
        clientMac,
        rejectedCode: currentCode,
      });

      if (!ok || data.status !== 'success' || !data.voucher) {
        hideOverlay('success-overlay');
        revealIfArmed();
        setHint('Could not connect you automatically. Use the code shown below to log in manually.');
        return;
      }

      currentCode = data.voucher;
      if (pendingReveal) pendingReveal.code = currentCode;
      $('success-code').textContent = currentCode;
    }
  }

  function showConnected(pkgLabel, redirectFromController) {
    $('connected-package').textContent = pkgLabel || 'Internet Access';
    const target = redirectFromController || originUrl || 'https://www.google.com';
    const total = 5;
    let left = total;
    $('connected-timer').textContent = left;
    $('connected-bar-fill').style.width = '100%';
    showOverlay('connected-overlay');

    connectedInterval = setInterval(() => {
      left -= 1;
      $('connected-timer').textContent = Math.max(0, left);
      $('connected-bar-fill').style.width = ((left / total) * 100) + '%';
      if (left <= 0) {
        clearInterval(connectedInterval); connectedInterval = null;
        window.location.href = target;
      }
    }, 1000);

    $('go-now').onclick = () => {
      if (connectedInterval) { clearInterval(connectedInterval); connectedInterval = null; }
      window.location.href = target;
    };
  }

  // ---------- Voucher (DIRECT to Omada — no backend call) ----------
  $('redeem-btn').addEventListener('click', async () => {
    const code = $('voucher-input').value.trim();
    if (!code) { setHint('Please enter a voucher code'); return; }
    setHint('');
    $('redeem-btn').disabled = true;
    $('redeem-btn').textContent = 'Connecting…';
    try {
      // Voucher does not know its package label up front — use a generic label.
      connectedPackageLabel = 'Voucher Access';
      const r = await omadaVoucherAuth(code);
      if (r.ok) {
        showConnected(connectedPackageLabel, r.result);
      } else {
        setHint(r.error || `Voucher rejected by controller${r.code != null ? ' (code ' + r.code + ')' : ''}.`);
      }
    } finally {
      $('redeem-btn').disabled = false;
      $('redeem-btn').textContent = 'Redeem';
    }
  });

  // ---------- M-Pesa (uses Supabase) ----------
  $('pay-btn').addEventListener('click', async () => {
    const phone = $('phone').value.trim();
    if (!phone || phone.length < 10) { setHint('Please enter a valid M-Pesa number'); return; }
    setHint('');
    $('pay-btn').disabled = true;

    const { ok, data } = await call('portal-mpesa-initiate', {
      phoneNumber: phone,
      packageType: selected.id,
      sessionId, clientMac, apMac, ssid: ssidName,
    });

    if (!ok || !data.success) {
      // LAYER 4 — already has an active package within last 24h
      if (data && data.alreadyActive && data.voucher) {
        $('pay-btn').disabled = false;
        connectedPackageLabel = data.packageType === '24hour' ? '24-Hour Package' : '2-Hour Package';
        setHint(data.message || 'You already have an active package. Reconnecting…', true);
        const r = await omadaVoucherAuth(data.voucher);
        if (r.ok) {
          showConnected(connectedPackageLabel, r.result);
        } else {
          setHint('Active package found but reconnect failed. Please contact support.');
        }
        return;
      }
      $('pay-btn').disabled = false;
      setHint(data.error || 'Failed to start payment. Please try again.');
      return;
    }

    connectedPackageLabel = selected.name;
    activeCheckoutRequestId = data.checkoutRequestId;
    startPaymentOverlay(phone, 90);
    pollPayment(data.checkoutRequestId);
  });

  $('cancel-pay').addEventListener('click', () => {
    stopPaymentFlow();
    setHint('Payment cancelled. You can try again.');
  });

  function pollPayment(checkoutRequestId) {
    let attempts = 0;
    // Fail-safe schedule: attempts fire every 2.5s.
    // Query Safaricom directly at ~15s / 30s / 45s / 60s / 75s so we never
    // sit on a "pending" that only failed because the async callback got lost.
    const stkQueryAt = new Set([6, 12, 18, 24, 30]);
    pollInterval = setInterval(async () => {
      attempts += 1;
      if (stkQueryAt.has(attempts)) {
        // Fire-and-forget; the edge function writes the terminal status to
        // the transactions row, so the next poll tick picks it up.
        call('mpesa-stk-query', { checkoutRequestId }).catch(() => {});
      }
      const { ok, data } = await call('portal-mpesa-poll', { checkoutRequestId, clientMac });
      if (!ok) return;
      if (data.status === 'success') {
        clearInterval(pollInterval); pollInterval = null;
        if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
        if (data.resumeToken) setResumeToken(data.resumeToken);
        armVoucherReveal(data.voucher, data.paidAt, data.revealAllowed);
        showSuccessThenAuth(data.voucher);
      } else if (data.status === 'failed') {
        stopPaymentFlow();
        clearResumeToken();
        setHint(data.error || 'Payment failed. Please try again.');
      } else if (data.status === 'no_voucher') {
        stopPaymentFlow();
        setHint('Payment received but no vouchers are currently available. Please contact support — your money is safe.');
      }
      if (attempts > 60) { stopPaymentFlow(); setHint('Still waiting on M-Pesa — please try again or contact support.'); }
    }, 2500);
  }

  // ---------- Init ----------
  renderPackages();
  $('pay-btn-text').textContent = `Pay KSh ${selected.price} — ${selected.name}`;

  $('cMac').value = clientMac; $('aMac').value = apMac; $('gMac').value = gatewayMac;
  $('sName').value = ssidName; $('rId').value = radioId; $('vId').value = vid; $('oUrl').value = originUrl;

  // LAYERS 1 + 2 — Silent auto-resume in the background.
  //   Layer 2 (token) covers MAC randomization: same browser, new MAC.
  //   Layer 1 (MAC) covers stable-MAC devices.
  // Both are package-duration bound (2h / 24h) — token dies with the voucher.
  (async () => {
    const resumeToken = getResumeToken();
    if (!clientMac && !resumeToken) return;
    try {
      const { ok, data } = await call('portal-resume-session', { clientMac, resumeToken });
      if (!ok || !data || !data.active || !data.voucher) {
        // If token existed but backend says it's dead (expired voucher), stop replaying it.
        if (resumeToken && data && data.active === false) clearResumeToken();
        return;
      }
      connectedPackageLabel = data.packageType === '24hour' ? '24-Hour Package' : '2-Hour Package';
      armVoucherReveal(data.voucher, data.paidAt, data.revealAllowed);
      const r = await omadaVoucherAuth(data.voucher);
      if (r.ok) showConnected(connectedPackageLabel, r.result);
      else revealIfArmed();
    } catch (_) { /* silent */ }
  })();

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) document.title = '⏳ Confirm M-Pesa…';
    else document.title = '4K Smart Solutions — Internet Access';
  });
})();
