CREATE TABLE public.session_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  voucher_code text,
  package_type text,
  duration_hours integer,
  transaction_id uuid,
  checkout_request_id text,
  client_mac text,
  previous_mac text,
  resume_source text,
  outcome text,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.session_events TO anon;
GRANT SELECT ON public.session_events TO authenticated;
GRANT ALL ON public.session_events TO service_role;

ALTER TABLE public.session_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view session events"
ON public.session_events FOR SELECT USING (true);

CREATE INDEX idx_session_events_created_at ON public.session_events (created_at DESC);
CREATE INDEX idx_session_events_type ON public.session_events (event_type);
CREATE INDEX idx_session_events_mac ON public.session_events (client_mac);
CREATE INDEX idx_session_events_checkout ON public.session_events (checkout_request_id);