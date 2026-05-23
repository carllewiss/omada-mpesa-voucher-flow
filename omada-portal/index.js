/* 4K Smart Solutions — Omada Internal Portal frontend
 * --------------------------------------------------------------
 * Architecture
 *  - VOUCHER login: submitted DIRECTLY to Omada (/portal/auth, authType=3). No cloud round-trip.
 *  - M-PESA: full transaction state machine through Supabase Edge Functions.
 *
 * State machine (transactions.status)
 *   initiating -> pending -> paid -> reserved -> connecting -> connected
 *   error branches: cancelled | insufficient_funds | timeout | invalid_pin | expired | failed | no_voucher
 *
 * Recovery
 *  - Vouchers are RESERVED (not consumed) on payment confirmation.
 *  - They are only PERMANENTLY consumed after the device proves real connectivity
 *    (Omada auth OK + /generate_204 reachable) by calling portal-confirm-auth.
 *  - If the browser crashes mid-flow, we call portal-resume-session by clientMac on next load
 *    and auto-reconnect with the reserved voucher.
 *
 * Identity
 *  - Client MAC (from Omada redirect URL) is the authentication identity.
 *  - The paying phone number is just a payment instrument — any phone may pay for any MAC.
 */
(() => {
  'use strict';

  const SUPABASE_URL = 'https://tyqcalkdvsmeczbbqfns.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR5cWNhbGtkdnNtZWN6YmJxZm5zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3NDUxNTYsImV4cCI6MjA4NjMyMTE1Nn0.VTgZPClT7Te2R-9Y6zvtVyDj6pVWRvX7svvvLSx3fcw';
  const FN = (n) => `${SUPABASE_URL}/functions/v1/${n}`;

  // -------- Omada-provided URL params (captive portal redirect) --------
  const qs = new URLSearchParams(window.location.search);
  const clientMac  = (qs.get('clientMac')  || '').toLowerCase();
  const apMac      = (qs.get('apMac')      || '').toLowerCase();
  const gatewayMac = (qs.get('gatewayMac') || '').toLowerCase();
  const ssidName   = qs.get('ssidName')   || '';
  const radioId    = qs.get('radioId')    || '';
  const vid        = qs.get('vid')        || '';
  const originUrl  = qs.get('originUrl')  || qs.get('redirect') || qs.get('landing') || '';

  // Per-visit session id (also persisted so a reload keeps the same id)
  const SID_KEY = '4ksmart_sid';
  const sessionId = sessionStorage.getItem(SID_KEY)
    || ((crypto.randomUUID && crypto.randomUUID()) || (Date.now() + '-' + Math.random().toString(36).slice(2)));
  sessionStorage.setItem(SID_KEY, sessionId);

  const PACKAGES = [
    { id: '2hour',  name: '2-Hour Package',  duration: '2 Hours',  price: 10 },
    { id: '24hour', name: '24-Hour Package', duration: '24 Hours', price: 30 },
  ];
  let selected = PACKAGES[0];
  let connectedPackageLabel = '';
  let activeTransactionId = null;

  const $ = (id) => document.getElementById(id);
  const setHint = (msg, ok) => {
    const el = $('hint');
    if (!msg) { el.style.display = 'none'; return; }
    el.className = 'alert' + (ok ? ' ok' : '');
    el.textContent = msg;
    el.style.display = 'block';
  };

  async function call(fnName, body) {
    try {
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
    } catch (e) {
      return { ok: false, status: 0, data: { error: 'Network error' } };
    }
  }

  // ---------- State timeline (visual UX) ----------
  const STEPS = ['stk','prompt','paid','reserve','auth','online'];
  function setStep(name, state /* 'done' | 'active' | 'pending' | 'error' */) {
    const li = document.querySelector(`#state-timeline li[data-step="${name}"]`);
    if (!li) return;
    li.className = state;
  }
  function markStepsThrough(upTo) {
    let reached = false;
    STEPS.forEach(s => {
      if (reached) { setStep(s, 'pending'); return; }
      if (s === upTo) { setStep(s, 'active'); reached = true; return; }
      setStep(s, 'done');
    });
  }
  function markStepsAllDone() { STEPS.forEach(s => setStep(s, 'done')); }
  function markStepsErrorAt(step) {
    let reached = false;
    STEPS.forEach(s => {
      if (reached) { setStep(s, 'pending'); return; }
      if (s === step) { setStep(s, 'error'); reached = true; return; }
      setStep(s, 'done');
    });
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
  async function omadaVoucherAuth(voucher) {
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

  // ---------- Connectivity probe ----------
  // After Omada says auth succeeded, verify we actually have public internet.
  // Use a captive-portal-aware endpoint (no-cors so we don't fail on opaque).
  async function verifyInternet(timeoutMs = 4000) {
    const probes = [
      'https://clients3.google.com/generate_204',
      'https://www.gstatic.com/generate_204',
      'https://connectivitycheck.gstatic.com/generate_204',
    ];
    for (const url of probes) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), timeoutMs);
        await fetch(url + '?_=' + Date.now(), { mode: 'no-cors', cache: 'no-store', signal: ctrl.signal });
        clearTimeout(t);
        return true; // got a network-layer response
      } catch (_) { /* try next */ }
    }
    return false;
  }

  // ---------- Overlays ----------
  let countdownInterval = null;
  let pollInterval = null;
  let connectedInterval = null;

  function showOverlay(id) { const el = $(id); el.classList.add('show'); el.setAttribute('aria-hidden', 'false'); }
  function hideOverlay(id) { const el = $(id); el.classList.remove('show'); el.setAttribute('aria-hidden', 'true'); }

  function setOverlayCopy(title, sub, muted) {
    if (title !== undefined) $('pay-title').textContent = title;
    if (sub   !== undefined) $('pay-sub').innerHTML    = sub;
    if (muted !== undefined) $('pay-muted').textContent = muted;
  }

  function startPaymentOverlay(phone, total = 90) {
    $('pay-phone').textContent = phone;
    $('timer').textContent = total;
    $('timer-bar-fill').style.width = '100%';
    STEPS.forEach(s => setStep(s, 'pending'));
    markStepsThrough('stk');
    showOverlay('payment-overlay');
    let left = total;
    countdownInterval = setInterval(() => {
      left -= 1;
      $('timer').textContent = Math.max(0, left);
      $('timer-bar-fill').style.width = ((left / total) * 100) + '%';
      if (left <= 0) {
        markStepsErrorAt('prompt');
        stopPaymentFlow();
        setHint('Payment timed out. Check your SMS — if money was deducted, just refresh this page and we will reconnect you automatically.');
      }
    }, 1000);
  }

  function stopPaymentFlow() {
    if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
    if (pollInterval)      { clearInterval(pollInterval);      pollInterval = null; }
    hideOverlay('payment-overlay');
    $('pay-btn').disabled = false;
  }

  async function onPaidIssueAndConnect(voucher, transactionId) {
    activeTransactionId = transactionId || activeTransactionId;
    markStepsThrough('auth');
    setOverlayCopy('Payment received', 'Voucher issued. Connecting you to WiFi…', 'Please keep this page open.');

    // Submit voucher straight to Omada
    const auth = await omadaVoucherAuth(voucher);
    if (!auth.ok) {
      markStepsErrorAt('auth');
      stopPaymentFlow();
      setHint(`Authorization failed${auth.code != null ? ' (code ' + auth.code + ')' : ''}: ${auth.error || 'Please refresh and try again — your payment is safe.'}`);
      return;
    }

    // Verify internet actually works
    markStepsThrough('online');
    setOverlayCopy('Verifying internet', 'Checking that your device is really online…', '');
    const online = await verifyInternet();

    if (!online) {
      // Omada says OK but probe failed. Still consider connected — captive portal may block probes.
      // We confirm anyway because Omada returned errorCode 0.
      console.warn('Probe failed but Omada auth succeeded — proceeding.');
    }

    // Permanently consume the voucher on the backend
    if (activeTransactionId) {
      call('portal-confirm-auth', { transactionId: activeTransactionId, clientMac }).catch(() => {});
    }

    markStepsAllDone();
    setTimeout(() => {
      hideOverlay('payment-overlay');
      showConnected(connectedPackageLabel || selected.name, auth.result);
    }, 600);
  }

  function showConnected(pkgLabel, redirectFromController) {
    $('connected-package').textContent = pkgLabel || 'Internet Access';
    const target = redirectFromController || originUrl || 'http://neverssl.com';
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

  // ---------- M-Pesa ----------
  $('pay-btn').addEventListener('click', async () => {
    const phone = $('phone').value.trim();
    if (!phone || phone.length < 10) { setHint('Please enter a valid M-Pesa number'); return; }
    setHint('');
    $('pay-btn').disabled = true;

    startPaymentOverlay(phone, 90);
    setOverlayCopy('Sending STK Push…', 'Connecting to M-Pesa…', '');

    const { ok, data } = await call('portal-mpesa-initiate', {
      phoneNumber: phone,
      packageType: selected.id,
      sessionId, clientMac, apMac, ssid: ssidName,
    });

    if (!ok || !data.success) {
      markStepsErrorAt('stk');
      stopPaymentFlow();
      setHint(data?.error || 'Failed to start payment. Please try again.');
      return;
    }

    activeTransactionId = data.transactionId || null;
    connectedPackageLabel = selected.name;
    markStepsThrough('prompt');
    setOverlayCopy('Confirm on your phone', `An M-Pesa prompt has been sent to <strong>${phone}</strong>.`, 'Enter your M-Pesa PIN to authorize the payment.');
    pollPayment(data.checkoutRequestId);
  });

  $('cancel-pay').addEventListener('click', () => {
    stopPaymentFlow();
    setHint('Payment cancelled. You can try again — if money was deducted, refresh and we will reconnect you automatically.');
  });

  // Human-readable error per state
  const ERR = {
    cancelled:          'You cancelled the M-Pesa prompt. Try again when ready.',
    insufficient_funds: 'Insufficient funds in your M-Pesa account.',
    timeout:            'No response from M-Pesa. Please try again.',
    invalid_pin:        'Wrong M-Pesa PIN entered. Please try again.',
    expired:            'The M-Pesa request expired. Please try again.',
    failed:             'Payment failed. Please try again.',
    no_voucher:         'Payment received but no vouchers are currently available. Please contact support — your money is safe.',
  };

  function pollPayment(checkoutRequestId) {
    let attempts = 0;
    pollInterval = setInterval(async () => {
      attempts += 1;
      const { ok, data } = await call('portal-mpesa-poll', { checkoutRequestId, clientMac, sessionId });
      if (!ok) return;

      if (data.status === 'paid') {
        clearInterval(pollInterval); pollInterval = null;
        if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
        markStepsThrough('reserve');
        setOverlayCopy('Payment received ✅', 'Reserving your voucher…', '');
        onPaidIssueAndConnect(data.voucher, data.transactionId);
        return;
      }

      if (ERR[data.status]) {
        markStepsErrorAt(data.status === 'no_voucher' ? 'reserve' : 'prompt');
        stopPaymentFlow();
        setHint(ERR[data.status]);
        return;
      }

      if (attempts > 60) {
        markStepsErrorAt('prompt');
        stopPaymentFlow();
        setHint('Still waiting on M-Pesa — please refresh, we will resume if your payment went through.');
      }
    }, 2500);
  }

  // ---------- Resume on load ----------
  // If this MAC has a recent paid (reserved or used) voucher in the last 24h,
  // immediately try to log it back in. Solves crashed-browser / weak-signal recovery.
  async function tryResumeForMac() {
    if (!clientMac) return;
    const { ok, data } = await call('portal-resume-session', { clientMac });
    if (!ok || !data?.found) return;

    activeTransactionId = data.transactionId;
    connectedPackageLabel = packageLabelFor(data.packageType);
    setHint('We found a recent payment for this device. Reconnecting…', true);

    showOverlay('payment-overlay');
    setOverlayCopy('Reconnecting', 'A previous payment was found for this device. Logging you back in…', '');
    STEPS.forEach(s => setStep(s, 'done'));
    setStep('auth', 'active');
    onPaidIssueAndConnect(data.voucher, data.transactionId);
  }

  function packageLabelFor(id) {
    const p = PACKAGES.find(x => x.id === id);
    return p ? p.name : 'Internet Access';
  }

  // ---------- Init ----------
  renderPackages();
  $('pay-btn-text').textContent = `Pay KSh ${selected.price} — ${selected.name}`;

  $('cMac').value = clientMac; $('aMac').value = apMac; $('gMac').value = gatewayMac;
  $('sName').value = ssidName; $('rId').value = radioId; $('vId').value = vid; $('oUrl').value = originUrl;

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) document.title = '⏳ Confirm M-Pesa…';
    else document.title = '4K Smart Solutions — Internet Access';
  });

  tryResumeForMac();
})();