# 4K Smart Solutions — Omada Internal Captive Portal

Modern voucher + M-Pesa captive portal designed for the **Omada Internal Portal** (not external).
It calls Supabase Edge Functions for payment + voucher logic and then auto-submits the
native Omada `/portal/auth` endpoint with the issued voucher.

## Files

- `index.html` — UI (voucher + M-Pesa only, no username/password)
- `index.css` — Brand-matched styling, payment overlay animation
- `index.js`  — Vanilla modern JS, Edge Function client, auto-login

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
## Anti-sharing model (voucher reveal)

1. **Device limit (controller side)** — In Omada → Voucher Groups, set **Limit
   number of users = 1** for every group used by the portal. A shared code is
   then rejected for a second phone, which makes sharing pointless.
2. **Conditional reveal** — The 6-minute code card is now shown **only when
   automatic authentication fails**. Customers who connect normally never see
   the code at all.
3. **Server-side gate** — `portal-mpesa-poll` and `portal-resume-session`
   decide reveal permission (`revealAllowed`). They refuse outside the
   6-minute window from confirmed payment, and refuse when a voucher has been
   seen on 3+ distinct MACs (logged as `voucher_share_suspected` in
   `session_events`).
