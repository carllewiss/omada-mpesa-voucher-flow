# 4K SMART SOLUTIONS - Omada Billing System

## Quick Start

1. **Publish** the captive portal app from Lovable
2. **Configure** Omada Controller External Portal URL
3. **Run** the Node.js polling agent on your local PC
4. Clients connect → pay → get authorized automatically

---

## Architecture

```
Client WiFi → Captive Portal → M-Pesa/Voucher Payment
                                       ↓
                              Cloud Database (paid, auth=no)
                                       ↓
                            Local Node.js Agent (polls every 5s)
                                       ↓
                              Omada Controller (authorize MAC)
                                       ↓
                              Cloud Database (paid, auth=yes)
```

---

## Database Connection Details

Use these to connect from your local Node.js agent or any external tool:

| Key | Value |
|---|---|
| **Supabase URL** | `https://tyqcalkdvsmeczbbqfns.supabase.co` |
| **Anon Key** | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR5cWNhbGtkdnNtZWN6YmJxZm5zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3NDUxNTYsImV4cCI6MjA4NjMyMTE1Nn0.VTgZPClT7Te2R-9Y6zvtVyDj6pVWRvX7svvvLSx3fcw` |
| **REST API** | `https://tyqcalkdvsmeczbbqfns.supabase.co/rest/v1/` |
| **Edge Functions** | `https://tyqcalkdvsmeczbbqfns.supabase.co/functions/v1/` |

---

## Packages

| Package | Duration | Price (KSh) |
|---|---|---|
| 2-Hour | 2 hours | 10 |
| 24-Hour | 24 hours | 30 |

### Adding More Packages

Edit `src/pages/Index.tsx`:
```typescript
const packages: Package[] = [
  { id: "2hour", name: "2-Hour Package", duration: "2 Hours", durationHours: 2, price: 10 },
  { id: "24hour", name: "24-Hour Package", duration: "24 Hours", durationHours: 24, price: 30 },
  // Add more:
  { id: "7day", name: "7-Day Package", duration: "7 Days", durationHours: 168, price: 200 },
];
```

---

## Omada Controller Setup

### External Portal URL

Set this in your Omada Controller → Captive Portal → External Portal:

```
https://omada-mpesa-voucher-flow.lovable.app/?clientMac=<clientMac>&clientIp=<clientIp>&apMac=<apMac>&ssid=<ssid>
```

---

## Local Node.js Polling Agent

### Prerequisites
- Node.js 18+ installed
- Access to your Omada Controller (same network)

### Setup

1. Download `omada-polling-agent.js` from the documents
2. Install dependencies:
   ```bash
   npm install express node-fetch@2
   ```
3. Edit the **CONFIG** section in the script:
   ```javascript
   const CONFIG = {
     // These are pre-filled — no changes needed:
     SUPABASE_URL: 'https://tyqcalkdvsmeczbbqfns.supabase.co',
     SUPABASE_ANON_KEY: '...already filled...',

     // CHANGE THESE to match your Omada Controller:
     OMADA_URL: 'https://192.168.0.1:8043',  // Your controller IP
     OMADA_SITE: 'Default',                    // Your site name
     OMADA_USERNAME: 'admin',                  // Your login
     OMADA_PASSWORD: 'admin',                  // Your password
   };
   ```
4. Run:
   ```bash
   node omada-polling-agent.js
   ```
5. Open **http://localhost:3000** for the dashboard

### Dashboard Features
- **Daily Report**: Today's payments, revenue, receipts
- **Weekly Report**: Week summary with daily breakdown and top payers
- **Agent Stats**: Live polling status and authorization counts

### What the Agent Does
1. Every 5 seconds, calls `GET /functions/v1/pending-authorizations`
2. Gets clients where `payment_status=paid` and `authorization_status=no`
3. Authorizes each MAC address on Omada Controller
4. Calls `POST /functions/v1/update-authorization` to mark `authorization_status=yes`

---

## Database Tables

### `transactions` — M-Pesa payments
| Column | Description |
|---|---|
| `phone_number` | M-Pesa phone (254...) |
| `amount` | Payment amount |
| `package_type` | `2hour` or `24hour` |
| `status` | `pending`, `success`, `failed`, `cancelled` |
| `mpesa_receipt` | Receipt number |
| `checkout_request_id` | M-Pesa checkout ID |

### `client_authorizations` — Authorization queue
| Column | Description |
|---|---|
| `mac_address` | Client MAC (from Omada URL) |
| `client_ip` | Client IP |
| `ap_mac` | Access point MAC |
| `ssid` | WiFi network name |
| `phone_number` | Phone or `voucher-user` |
| `amount` | Payment amount (0 for vouchers) |
| `package_type` | `2hour` or `24hour` |
| `duration_hours` | 2 or 24 |
| `payment_status` | `paid` or `unpaid` |
| `authorization_status` | `yes` or `no` |

### `vouchers` — Voucher codes
| Column | Description |
|---|---|
| `code` | Unique voucher code |
| `package_type` | `2hour` or `24hour` |
| `duration_hours` | 2 or 24 |
| `status` | `unused` or `used` |
| `used_by_mac` | MAC of client who used it |

### Inserting Vouchers Manually

Use the REST API to insert vouchers:
```bash
curl -X POST "https://tyqcalkdvsmeczbbqfns.supabase.co/rest/v1/vouchers" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR5cWNhbGtkdnNtZWN6YmJxZm5zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3NDUxNTYsImV4cCI6MjA4NjMyMTE1Nn0.VTgZPClT7Te2R-9Y6zvtVyDj6pVWRvX7svvvLSx3fcw" \
  -H "Content-Type: application/json" \
  -d '{"code": "WIFI-1234", "package_type": "2hour", "duration_hours": 2}'
```

---

## Edge Functions

| Function | Method | Purpose |
|---|---|---|
| `mpesa-stk-push` | POST | Sends STK push to phone |
| `mpesa-callback` | POST | Receives Safaricom payment result |
| `mpesa-status` | GET | Frontend polls payment status |
| `pending-authorizations` | GET | Returns paid, unauthorized clients |
| `update-authorization` | POST | Marks client as authorized |
| `redeem-voucher` | POST | Validates and redeems voucher code |

---

## API Endpoints for External Use

### Fetch pending clients
```
GET https://tyqcalkdvsmeczbbqfns.supabase.co/functions/v1/pending-authorizations
Headers: apikey: <anon-key>

Response: { "clients": [{ "id", "mac_address", "duration_hours", ... }] }
```

### Mark client authorized
```
POST https://tyqcalkdvsmeczbbqfns.supabase.co/functions/v1/update-authorization
Headers: apikey: <anon-key>, Content-Type: application/json
Body: { "id": "uuid-of-record" }

Response: { "success": true }
```

### Query transactions (REST API)
```
GET https://tyqcalkdvsmeczbbqfns.supabase.co/rest/v1/transactions?status=eq.success&order=created_at.desc
Headers: apikey: <anon-key>
```

---

## M-Pesa Configuration

Production credentials stored as secrets (Paybill **4183147**):
- `MPESA_CONSUMER_KEY`
- `MPESA_CONSUMER_SECRET`
- `MPESA_PASSKEY`
- `MPESA_SHORTCODE`

---

## Branding Customization

| What | Where |
|---|---|
| Company name | `src/pages/Index.tsx` — change `4K SMART SOLUTIONS` |
| Colors | `src/index.css` and `tailwind.config.ts` |
| Page title | `index.html` — `<title>` tag |
| Support phone | `src/pages/Index.tsx` — search for `0736217411` and update |
| WhatsApp link | `src/pages/Index.tsx` — search for `254736217411` and update |

---

## Re-Authentication (Disconnected Clients)

If a client gets disconnected before their paid time expires, the system **automatically re-authorizes** them:

1. Client reconnects to WiFi → redirected to captive portal with MAC params
2. Portal checks `client_authorizations` for an active session matching the MAC
3. If a valid (unexpired) session exists, a new authorization record is inserted
4. The Node.js agent picks it up and re-authorizes the MAC on Omada
5. Client skips the payment screen entirely

**No action needed** — this is fully automatic. The client sees the "Connected" screen instead of the payment form.

---

## Payment Flow

1. Client connects to WiFi → redirected to captive portal with MAC/IP params
2. Client selects package + enters M-Pesa number (or voucher code)
3. M-Pesa: STK push → payment → callback → record saved
4. Voucher: code validated → marked used → record saved
5. Both paths insert into `client_authorizations` with `paid` + `auth=no`
6. Local Node.js agent picks up record → authorizes on Omada → updates to `auth=yes`

---

## Troubleshooting

| Issue | Solution |
|---|---|
| STK push not received | Check phone format (must be 254...) |
| Payment stuck | Check edge function logs in Lovable Cloud |
| Client not authorized | Check Node.js agent console for errors |
| MAC missing | Verify Omada portal URL has `clientMac` param |
| Voucher invalid | Check voucher exists in DB with status `unused` |
| Agent can't reach Omada | Verify IP/port and credentials in CONFIG |
| Client asked to pay again | Check re-auth: MAC must match and time not expired |
