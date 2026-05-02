/* 4K Smart Solutions — Omada Internal Portal frontend
 * - Voucher + M-Pesa only (no username/password)
 * - Talks to Supabase Edge Functions
 * - Server decides price; client only sends packageType
 * - On success: fills Omada native form (#voucherCode + clientMac) and submits /portal/auth
 */
(() => {
  'use strict';

  // ============ EDIT THESE TWO IF YOUR PROJECT REF CHANGES ============
  const SUPABASE_URL = 'https://tyqcalkdvsmeczbbqfns.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR5cWNhbGtkdnNtZWN6YmJxZm5zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3NDUxNTYsImV4cCI6MjA4NjMyMTE1Nn0.VTgZPClT7Te2R-9Y6zvtVyDj6pVWRvX7svvvLSx3fcw';
  // ====================================================================

  const FN = (name) => `${SUPABASE_URL}/functions/v1/${name}`;

  // ---------- Omada URL params (always present in real captive portal) ----------
  const qs = new URLSearchParams(window.location.search);
  const clientMac  = qs.get('clientMac')  || '';
  const apMac      = qs.get('apMac')      || '';
  const gatewayMac = qs.get('gatewayMac') || '';
  const ssidName   = qs.get('ssidName')   || '';
  const radioId    = qs.get('radioId')    || '';
  const vid        = qs.get('vid')        || '';
  const originUrl  = qs.get('originUrl')  || '';

  // Each visitor session is unique to avoid two concurrent payers crossing wires.
  const sessionId = (crypto.randomUUID && crypto.randomUUID()) ||
    (Date.now() + '-' + Math.random().toString(36).slice(2));

  // ---------- Packages (display only — server validates the real price) ----------
  const PACKAGES = [
    { id: '2hour',  name: '2-Hour Package',  duration: '2 Hours',  price: 10 },
    { id: '24hour', name: '24-Hour Package', duration: '24 Hours', price: 30 },
  ];
  let selected = PACKAGES[0];

  // ---------- DOM helpers ----------
  const $ = (id) => document.getElementById(id);
  const setHint = (msg, ok) => {
    const el = $('hint');
    if (!msg) { el.style.display = 'none'; return; }
    el.className = 'alert' + (ok ? ' ok' : '');
    el.textContent = msg;
    el.style.display = 'block';
  };

  // ---------- HTTP helper ----------
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

  // ---------- Render package picker ----------
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

  // ---------- Omada auto-login (THE MAGIC) ----------
  // Fills the native Omada form's voucherCode field with the issued voucher
  // and submits to the controller. Per Omada docs, /portal/auth accepts
  // form-encoded POSTs from the Internal Portal context.
  function autoLoginWithVoucher(voucher) {
    $('voucherCode').value = voucher;
    $('cMac').value  = clientMac;
    $('aMac').value  = apMac;
    $('gMac').value  = gatewayMac;
    $('sName').value = ssidName;
    $('rId').value   = radioId;
    $('vId').value   = vid;
    $('oUrl').value  = originUrl;

    // Build Omada auth payload
    const payload = {
      authType: 3, // VOUCHER
      voucherCode: voucher,
      clientMac, apMac, gatewayMac, ssidName,
      radioId: radioId ? Number(radioId) : undefined,
      vid: vid ? Number(vid) : undefined,
      originUrl,
    };

    fetch('/portal/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(r => r.json().catch(() => ({})))
      .then(res => {
        if (res && res.errorCode === 0) {
          window.location.href = res.result || originUrl || 'https://www.google.com';
        } else {
          setHint('Authorization failed. Please try again. (' + (res && res.errorCode) + ')');
          hideOverlay('success-overlay');
        }
      })
      .catch(() => {
        // Some controllers expect form-encoded — fall back to native submit
        $('omada-form').setAttribute('action', '/portal/auth');
        $('omada-form').setAttribute('method', 'POST');
        $('omada-form').submit();
      });
  }

  // ---------- Overlays ----------
  let countdownInterval = null;
  let pollInterval = null;

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

  function showSuccess(code) {
    $('success-code').textContent = code;
    hideOverlay('payment-overlay');
    showOverlay('success-overlay');
    setTimeout(() => autoLoginWithVoucher(code), 1200);
  }

  // ---------- Voucher redeem ----------
  $('redeem-btn').addEventListener('click', async () => {
    const code = $('voucher-input').value.trim();
    if (!code) { setHint('Please enter a voucher code'); return; }
    setHint('');
    $('redeem-btn').disabled = true;
    $('redeem-btn').textContent = 'Checking…';
    try {
      const { ok, data } = await call('portal-redeem-voucher', {
        code, clientMac, apMac, ssid: ssidName,
      });
      if (ok && data.success) {
        setHint('Voucher accepted! Connecting…', true);
        showSuccess(data.voucher.code);
      } else {
        setHint(data.error || 'Invalid voucher.');
      }
    } catch (e) {
      setHint('Network error. Please try again.');
    } finally {
      $('redeem-btn').disabled = false;
      $('redeem-btn').textContent = 'Redeem';
    }
  });

  // ---------- M-Pesa pay ----------
  $('pay-btn').addEventListener('click', async () => {
    const phone = $('phone').value.trim();
    if (!phone || phone.length < 10) { setHint('Please enter a valid M-Pesa number'); return; }
    setHint('');
    $('pay-btn').disabled = true;

    // NOTE: We deliberately do NOT send `amount`/`price`. The Edge Function
    // looks up the price from `package_pricing` based on packageType.
    const { ok, data } = await call('portal-mpesa-initiate', {
      phoneNumber: phone,
      packageType: selected.id,
      sessionId, clientMac, apMac, ssid: ssidName,
    });

    if (!ok || !data.success) {
      $('pay-btn').disabled = false;
      setHint(data.error || 'Failed to start payment. Please try again.');
      return;
    }

    startPaymentOverlay(phone, 90);
    pollPayment(data.checkoutRequestId);
  });

  $('cancel-pay').addEventListener('click', () => {
    stopPaymentFlow();
    setHint('Payment cancelled. You can try again.');
  });

  // ---------- Poll payment status ----------
  function pollPayment(checkoutRequestId) {
    let attempts = 0;
    pollInterval = setInterval(async () => {
      attempts += 1;
      const { ok, data } = await call('portal-mpesa-poll', { checkoutRequestId, clientMac });
      if (!ok) return;
      if (data.status === 'success') {
        clearInterval(pollInterval); pollInterval = null;
        if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
        showSuccess(data.voucher);
      } else if (data.status === 'failed') {
        stopPaymentFlow();
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

  // Pre-fill the hidden Omada inputs so manual debug submits work too
  $('cMac').value = clientMac; $('aMac').value = apMac; $('gMac').value = gatewayMac;
  $('sName').value = ssidName; $('rId').value = radioId; $('vId').value = vid; $('oUrl').value = originUrl;

  // Friendly visibility ping — tab title flicker keeps mobile WebView "alive"
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) document.title = '⏳ Confirm M-Pesa…';
    else document.title = '4K Smart Solutions — Internet Access';
  });
})();