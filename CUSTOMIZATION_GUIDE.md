# 4K SMART SOLUTIONS - Omada Billing System Documentation

## Overview

This is a complete automated billing system for TP-Link Omada Controller hotspots. Users connect to WiFi, get redirected to a captive portal, select a package, pay via M-Pesa (Paybill **4183147**), and get automatically authorized for internet access.

### Architecture

```
┌──────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  Omada WiFi  │───▶│  Captive Portal  │───▶│  M-Pesa STK     │
│  (Client)    │    │  (This App)      │    │  Push Payment   │
└──────────────┘    └──────────────────┘    └─────────────────┘
                            │                        │
                            ▼                        ▼
                    ┌──────────────────┐    ┌─────────────────┐
                    │  client_         │◀───│  mpesa-callback  │
                    │  authorizations  │    │  (Edge Function) │
                    │  (Database)      │    └─────────────────┘
                    └──────────────────┘
                            │
                            ▼
                    ┌──────────────────┐    ┌─────────────────┐
                    │  Local Node.js   │───▶│  Omada Controller│
                    │  Polling Agent   │    │  (Authorize MAC) │
                    └──────────────────┘    └─────────────────┘
```

## System Components

### 1. Captive Portal (Frontend)
- **URL**: Hosted on Lovable Cloud
- **Purpose**: Displays package options and handles M-Pesa payment
- **Captures**: Omada URL parameters (`clientMac`, `clientIp`, `apMac`, `ssid`)

### 2. Edge Functions (Backend)
| Function | Method | Purpose |
|---|---|---|
| `mpesa-stk-push` | POST | Initiates M-Pesa STK push to user's phone |
| `mpesa-callback` | POST | Receives payment confirmation from Safaricom |
| `mpesa-status` | GET | Frontend polls this to check payment status |
| `pending-authorizations` | GET | Returns paid clients awaiting authorization |
| `update-authorization` | POST | Marks a client as authorized after Omada auth |

### 3. Database Tables

#### `transactions` — M-Pesa payment tracking
| Column | Description |
|---|---|
| `phone_number` | M-Pesa phone number |
| `amount` | Payment amount |
| `package_type` | `2hour` or `24hour` |
| `checkout_request_id` | M-Pesa checkout ID |
| `status` | `pending`, `success`, `failed`, `cancelled` |
| `mpesa_receipt` | M-Pesa receipt number |

#### `client_authorizations` — Client authorization queue
| Column | Description |
|---|---|
| `mac_address` | Client MAC address (from Omada URL) |
| `client_ip` | Client IP address (from Omada URL) |
| `ap_mac` | Access point MAC (from Omada URL) |
| `ssid` | WiFi network name (from Omada URL) |
| `phone_number` | M-Pesa phone number |
| `amount` | Payment amount |
| `package_type` | `2hour` or `24hour` |
| `duration_hours` | `2` or `24` |
| `payment_status` | `paid` or `unpaid` |
| `authorization_status` | `yes` or `no` |

---

## Packages

| Package | Duration | Price |
|---|---|---|
| 2-Hour | 2 hours | KSh 10 |
| 24-Hour | 24 hours | KSh 30 |

To add more packages, edit `src/pages/Index.tsx`:
```typescript
const packages: Package[] = [
  { id: "2hour", name: "2-Hour Package", duration: "2 Hours", durationHours: 2, price: 10 },
  { id: "24hour", name: "24-Hour Package", duration: "24 Hours", durationHours: 24, price: 30 },
  // Add more here:
  { id: "7day", name: "7-Day Package", duration: "7 Days", durationHours: 168, price: 200 },
];
```

---

## M-Pesa Configuration

Production credentials are stored as secrets in Lovable Cloud (never in code):

| Secret | Description |
|---|---|
| `MPESA_CONSUMER_KEY` | Safaricom API consumer key |
| `MPESA_CONSUMER_SECRET` | Safaricom API consumer secret |
| `MPESA_PASSKEY` | STK push passkey |
| `MPESA_SHORTCODE` | Paybill number (4183147) |

The STK push uses the **production** Safaricom API: `https://api.safaricom.co.ke`

---

## Omada Controller Setup

### Captive Portal URL Configuration

In your Omada Controller, set the **External Portal URL** to your published app URL with Omada parameters:

```
https://omada-mpesa-voucher-flow.lovable.app/?clientMac=<clientMac>&clientIp=<clientIp>&apMac=<apMac>&ssid=<ssid>
```

The frontend automatically captures these URL parameters and stores them in the `client_authorizations` table.

---

## Local Node.js Polling Agent

Since your server is behind NAT without a public IP, a local Node.js script polls the cloud system for paid clients and authorizes them on the Omada Controller.

### How It Works

1. Every 5 seconds, the script calls `GET /functions/v1/pending-authorizations`
2. It receives a list of clients with `payment_status=paid` and `authorization_status=no`
3. For each client, it authorizes the MAC address on the Omada Controller via its API
4. After successful authorization, it calls `POST /functions/v1/update-authorization` with `{ "id": "<record_id>" }` to mark the client as authorized

### API Endpoints for the Polling Agent

#### Fetch pending clients
```
GET https://tyqcalkdvsmeczbbqfns.supabase.co/functions/v1/pending-authorizations

Response:
{
  "clients": [
    {
      "id": "uuid",
      "mac_address": "AA:BB:CC:DD:EE:FF",
      "client_ip": "192.168.1.100",
      "ap_mac": "11:22:33:44:55:66",
      "ssid": "4KSMART",
      "phone_number": "254700000000",
      "amount": 10,
      "package_type": "2hour",
      "duration_hours": 2,
      "payment_status": "paid",
      "authorization_status": "no"
    }
  ]
}
```

#### Mark client as authorized
```
POST https://tyqcalkdvsmeczbbqfns.supabase.co/functions/v1/update-authorization
Content-Type: application/json

Body: { "id": "uuid-of-the-record" }

Response: { "success": true, "client": { ... } }
```

### Sample Node.js Script Structure

```javascript
const SUPABASE_URL = 'https://tyqcalkdvsmeczbbqfns.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key';
const OMADA_URL = 'https://your-omada-controller:8043';
const OMADA_SITE = 'Default';

async function pollPendingClients() {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/pending-authorizations`, {
    headers: { 'apikey': SUPABASE_ANON_KEY }
  });
  const { clients } = await res.json();

  for (const client of clients) {
    console.log(`Authorizing MAC: ${client.mac_address} for ${client.duration_hours}hrs`);

    // 1. Authorize on Omada Controller (use Omada API)
    const authorized = await authorizeOnOmada(client.mac_address, client.duration_hours);

    if (authorized) {
      // 2. Update authorization status
      await fetch(`${SUPABASE_URL}/functions/v1/update-authorization`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_ANON_KEY
        },
        body: JSON.stringify({ id: client.id })
      });
      console.log(`✅ Client ${client.mac_address} authorized`);
    }
  }
}

// Poll every 5 seconds
setInterval(pollPendingClients, 5000);
```

---

## Branding Customization

### Company Name
- **File**: `src/pages/Index.tsx`
- Change `4K SMART SOLUTIONS` in the header

### Colors
- **File**: `src/index.css` — CSS custom properties
- **File**: `tailwind.config.ts` — Tailwind tokens

### Page Title
- **File**: `index.html` — Update `<title>` and meta tags

---

## Payment Flow (Step by Step)

1. Client connects to Omada WiFi → redirected to captive portal with MAC/IP params
2. Client selects package (2hr / 24hr) and enters M-Pesa number
3. Frontend calls `mpesa-stk-push` → Safaricom sends STK push to phone
4. Client enters PIN → Safaricom calls `mpesa-callback` with result
5. Callback updates `transactions` table to `status=success`
6. Frontend polls `mpesa-status` and detects success
7. Frontend inserts record into `client_authorizations` with `payment_status=paid`, `authorization_status=no`
8. Local Node.js agent picks up the record via `pending-authorizations`
9. Agent authorizes MAC on Omada Controller
10. Agent calls `update-authorization` to set `authorization_status=yes`

---

## Security Notes

- M-Pesa credentials are stored as encrypted secrets (never in code)
- The `mpesa-callback` endpoint is public (required by Safaricom)
- All other endpoints use CORS headers for web access
- Database has RLS enabled (public access for this captive portal use case)
- No user authentication required (captive portal is pre-auth by design)

---

## Troubleshooting

| Issue | Solution |
|---|---|
| STK push not received | Check phone number format (must be 254...) |
| Payment stuck on "waiting" | Check `mpesa-callback` edge function logs |
| Client not authorized | Check `pending-authorizations` returns the client; check Node.js agent logs |
| MAC address missing | Verify Omada portal URL includes `clientMac` parameter |
| Edge function errors | Check logs in Lovable Cloud backend panel |

---

## Development

```bash
npm install
npm run dev
```

## Deployment

Click **Share → Publish** in Lovable to deploy. Edge functions deploy automatically.

---

*For support, contact your development team or consult Safaricom M-Pesa API docs and TP-Link Omada Controller API docs.*
