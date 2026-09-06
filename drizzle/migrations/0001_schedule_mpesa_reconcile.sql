-- lovable-cron-fallback-reviewed: 1440 runs/day; payment reconciliation backstop — M-Pesa callbacks are frequently missed and a paid customer must be issued a voucher within ~60s or they stay offline after paying.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT cron.unschedule('mpesa-reconcile-every-minute')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mpesa-reconcile-every-minute');

SELECT cron.schedule(
  'mpesa-reconcile-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://tyqcalkdvsmeczbbqfns.supabase.co/functions/v1/mpesa-reconcile',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{"source":"cron"}'::jsonb
  ) AS request_id;
  $$
);
