-- 1. Add is_used boolean to vouchers (kept in sync with existing status column)
ALTER TABLE public.vouchers
  ADD COLUMN IF NOT EXISTS is_used boolean NOT NULL DEFAULT false;

UPDATE public.vouchers SET is_used = (status = 'used') WHERE is_used <> (status = 'used');

CREATE OR REPLACE FUNCTION public.sync_voucher_is_used()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.is_used := (NEW.status = 'used');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_voucher_is_used ON public.vouchers;
CREATE TRIGGER trg_sync_voucher_is_used
BEFORE INSERT OR UPDATE ON public.vouchers
FOR EACH ROW EXECUTE FUNCTION public.sync_voucher_is_used();

CREATE INDEX IF NOT EXISTS idx_vouchers_unused_pkg
  ON public.vouchers (package_type) WHERE is_used = false;

-- 2. Server-trusted package pricing
CREATE TABLE IF NOT EXISTS public.package_pricing (
  package_type text PRIMARY KEY,
  price_kes numeric NOT NULL,
  duration_hours integer NOT NULL,
  display_name text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.package_pricing ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read pricing" ON public.package_pricing;
CREATE POLICY "Public can read pricing"
  ON public.package_pricing FOR SELECT
  USING (true);

INSERT INTO public.package_pricing (package_type, price_kes, duration_hours, display_name)
VALUES
  ('2hour',  10, 2,  '2-Hour Package'),
  ('24hour', 30, 24, '24-Hour Package')
ON CONFLICT (package_type) DO UPDATE
  SET price_kes = EXCLUDED.price_kes,
      duration_hours = EXCLUDED.duration_hours,
      display_name = EXCLUDED.display_name,
      updated_at = now();

-- 3. Atomic voucher claim function (race-safe)
CREATE OR REPLACE FUNCTION public.claim_voucher_for_package(
  _package_type text,
  _client_mac text DEFAULT NULL
)
RETURNS TABLE(code text, duration_hours integer, package_type text)
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _claimed_id uuid;
BEGIN
  SELECT v.id INTO _claimed_id
  FROM public.vouchers v
  WHERE v.is_used = false AND v.package_type = _package_type
  ORDER BY v.created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF _claimed_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.vouchers
     SET status = 'used',
         is_used = true,
         used_at = now(),
         used_by_mac = _client_mac
   WHERE id = _claimed_id
  RETURNING vouchers.code, vouchers.duration_hours, vouchers.package_type
       INTO code, duration_hours, package_type;

  RETURN NEXT;
END;
$$;