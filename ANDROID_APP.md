# 4K SMART — Android Admin App

Native Android wrapper around the `/admin` dashboard. Listens to Lovable Cloud in real time and, on every successful M-Pesa payment, sends the voucher code from **SIM 2 (slot index 1)** automatically.

## SMS template

```
4K SMART WiFi: Your voucher is {CODE}. Valid for {HOURS} hrs. Thank you!
```

## How to get the APK (GitHub Actions — zero local setup)

1. Push this repo to GitHub (Lovable → GitHub → Connect project).
2. Open **Actions → Build Android APK → Run workflow** (or just push to `main`).
3. When it finishes, open the run and download the artifact **`4ksmart-admin-debug-apk`**.
4. Transfer `app-debug.apk` to the phone with SIM 2, open it, allow “Install unknown apps”, install.
5. First launch:
   - Grant **SMS** permission → required to send vouchers.
   - Grant **Phone** permission → required so we can target SIM 2 specifically.
   - The app opens straight into the admin dashboard (no login).

## How it works

- The app loads `/admin` from the live Lovable preview URL (set in `capacitor.config.ts`).
- A Capacitor plugin (`Sim2Sms`, Kotlin) calls `SmsManager.createForSubscriptionId(subIdForSlot1)` and sends the SMS.
- A Supabase Realtime channel on the `transactions` table fires on every change; when `status` becomes `success`/`paid` and a `voucher_code` is present, the app sends the SMS and remembers the transaction id in `localStorage` so it never resends.
- The admin dashboard shows totals, search, and a manual **Send** button for any past row.

## Local build (optional, instead of GH Actions)

```bash
bun install
bun run build
npx cap add android       # first time only
npx cap sync android
bash scripts/android-overlay.sh
cd android && ./gradlew assembleDebug
# APK at android/app/build/outputs/apk/debug/app-debug.apk
```

## Important notes

- **Sideload-only.** Google Play bans `SEND_SMS` unless the app is the default SMS app. Do not publish to Play.
- **SIM 2 must be inserted and active** on the phone running the app, and must have airtime / an SMS bundle.
- If the phone is single-SIM or SIM 2 is missing, Android falls back to the default outgoing SIM.
- No authentication — anyone with the APK can see payments. Keep the APK private.