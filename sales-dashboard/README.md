# 4K SMART SOLUTIONS — Sales Dashboard

A small, standalone sales dashboard. Plain HTML/CSS/JavaScript — no build step, no
Lovable, no server. It reads the same live database your captive portal writes to.

## What it shows
- Today, Yesterday, This week, This month, All time revenue (successful payments only)
- Last 30 days trend, last 12 weeks, last 12 months
- Sales by package for the current month
- The 20 most recent payments
- Auto-refresh every 60 seconds, all times in Kenya time (EAT)

## How to run it
**Locally:** just double-click `index.html` (or run `npx serve .` in this folder).

**Host it:** upload the whole folder to any static host — Netlify, Vercel,
Cloudflare Pages, cPanel, Nginx, or an S3 bucket. No configuration needed.

## Settings
Everything configurable lives in `config.js`:
- `SUPABASE_URL` / `SUPABASE_KEY` — the backend it reads from (already filled in)
- `TIMEZONE_OFFSET_HOURS` — 3 for Kenya
- `AUTO_REFRESH_SECONDS` — how often it reloads

## Note on access
The key in `config.js` is the public/anon key — the same one the portal uses. Because
the dashboard is public once you host it, put it behind your host's password
protection (Netlify/Vercel both support this) if you don't want the sales figures
visible to anyone with the link.
