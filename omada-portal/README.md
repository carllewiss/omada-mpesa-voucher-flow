# 4K Smart Solutions — Omada Internal Captive Portal

Production-grade voucher + M-Pesa captive portal for the **Omada Internal Portal**.

- **Vouchers** submit DIRECTLY to the Omada controller (`/portal/auth`, `authType=3`). No cloud round-trip.
- **M-Pesa** uses a recovery-safe transaction state machine through cloud Edge Functions.

## Transaction state machine

```
initiating → pending → paid → reserved → connecting → connected
                ↘ cancelled | insufficient_funds | timeout | invalid_pin | expired | failed | no_voucher
```

Key principle: **Payment Success ≠ Authentication Success**.

1. STK Push is initiated server-side using the **server-decided price** (frontend price is ignored).
2. M-Pesa callback maps Daraja `ResultCode` to a granular status
   (`0 → paid`, `1 → insufficient_funds`, `1032 → cancelled`, `1037 → timeout`, `2001 → invalid_pin`, `1019 → expired`).
3. On `paid`, the poll endpoint **reserves** (does not consume) a voucher via
   `reserve_voucher_for_transaction(...)` with `FOR UPDATE SKIP LOCKED`.
4. The frontend submits the voucher to Omada `/portal/auth`.
5. The frontend runs a connectivity probe (`/generate_204`).
6. Only after Omada + probe succeed do we call `portal-confirm-auth`, which permanently
   marks the voucher used (`confirm_voucher_used`).
7. Stale reservations are released automatically by `release_expired_reservations()`
   (called inline on every poll).

## Recovery

- Browser crash, weak signal, captive-portal cache, or PIN-screen kill all preserve the voucher.
- On next portal load the page calls `portal-resume-session` with the device's **client MAC**.
- If there is a recent (≤24h) paid voucher for that MAC, the page auto-reconnects with no second payment.

## Identity model

- **Client MAC** (from the Omada redirect URL) is the authentication identity.
- The paying phone number is just a payment instrument — any phone can pay for any MAC.
- Vouchers carry `reserved_for_mac` so two devices can never share one.

## Files

- `index.html` — UI (voucher + M-Pesa only, no username/password)
- `index.css` — Brand-matched styling, payment overlay + live state timeline
- `index.js`  — Modern vanilla JS: state machine, resume, connectivity probe, direct Omada voucher auth

## Edge functions used

- `portal-mpesa-initiate` — starts STK, stores tx with `session_id` + `client_mac`
- `portal-mpesa-poll` — granular status, reserves voucher when paid
- `portal-confirm-auth` — permanently consumes voucher after connectivity verified
- `portal-resume-session` — recovers a paid voucher by MAC after a browser crash

## Upload to Omada Controller

1. Omada Controller → Settings → Authentication → **Portal Customization**
2. Choose the Internal Portal whose auth type is **Voucher**
3. Upload `omada-captive-portal.zip`
4. Bind the portal to your SSID(s)

## Security model

- The frontend **never** tells the backend the price.
  It sends only `packageType` (e.g. `2hour`).
- `portal-mpesa-initiate` looks up `package_pricing` server-side
  and uses that amount with M-Pesa STK Push.
- Vouchers are claimed atomically via the
  `claim_voucher_for_package` SQL function (`FOR UPDATE SKIP LOCKED`)
  so two simultaneous payers can never get the same code.
- Manual voucher redemption is case-sensitive and atomic
  (`update ... where code = ? and is_used = false`).

## Allow your Edge Functions to receive Omada portal traffic

The three portal functions (`portal-mpesa-initiate`, `portal-mpesa-poll`,
`portal-redeem-voucher`) reply with `Access-Control-Allow-Origin: *` so
browsers running the portal page (which is served from your Omada
Controller's IP, e.g. `https://192.168.0.3:8043`) can call them.

## Editing the project ref

If you migrate to a different Supabase project, update these two
constants at the top of `index.js`:

```js
const SUPABASE_URL = '...';
const SUPABASE_ANON_KEY = '...';
```