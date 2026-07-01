
CREATE TABLE public.voucher_swaps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_request_id text,
  client_mac text,
  rejected_code text NOT NULL,
  new_code text,
  package_type text,
  status text NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.voucher_swaps TO anon, authenticated;
GRANT ALL ON public.voucher_swaps TO service_role;

ALTER TABLE public.voucher_swaps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can view swap logs"
  ON public.voucher_swaps FOR SELECT
  USING (true);

CREATE INDEX idx_voucher_swaps_created_at ON public.voucher_swaps (created_at DESC);
CREATE INDEX idx_voucher_swaps_checkout ON public.voucher_swaps (checkout_request_id);
