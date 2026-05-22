
-- 1. Vouchers: add reservation tracking
ALTER TABLE public.vouchers
  ADD COLUMN IF NOT EXISTS reserved_until timestamptz,
  ADD COLUMN IF NOT EXISTS reserved_for_mac text,
  ADD COLUMN IF NOT EXISTS reserved_for_session text,
  ADD COLUMN IF NOT EXISTS transaction_id uuid;

-- 2. Transactions: add session, mac, result_code, voucher_code, authenticated_at
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS session_id text,
  ADD COLUMN IF NOT EXISTS client_mac text,
  ADD COLUMN IF NOT EXISTS ap_mac text,
  ADD COLUMN IF NOT EXISTS ssid text,
  ADD COLUMN IF NOT EXISTS result_code integer,
  ADD COLUMN IF NOT EXISTS voucher_code text,
  ADD COLUMN IF NOT EXISTS authenticated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_tx_session ON public.transactions(session_id);
CREATE INDEX IF NOT EXISTS idx_tx_client_mac ON public.transactions(client_mac);
CREATE INDEX IF NOT EXISTS idx_vouchers_reserved ON public.vouchers(reserved_until) WHERE reserved_until IS NOT NULL;

-- 3. Reserve (not consume) a voucher for a paid transaction.
-- Idempotent: if this transaction already has one reserved/used, return that.
CREATE OR REPLACE FUNCTION public.reserve_voucher_for_transaction(
  _transaction_id uuid,
  _package_type text,
  _client_mac text,
  _session_id text,
  _hold_minutes integer DEFAULT 10
) RETURNS TABLE(code text, duration_hours integer, package_type text, status text)
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  _id uuid;
BEGIN
  -- Already issued?
  SELECT v.id INTO _id
  FROM public.vouchers v
  WHERE v.transaction_id = _transaction_id
  LIMIT 1;

  IF _id IS NOT NULL THEN
    -- Extend reservation if still reserved
    UPDATE public.vouchers
       SET reserved_until = CASE WHEN status = 'reserved'
                                 THEN now() + make_interval(mins => _hold_minutes)
                                 ELSE reserved_until END
     WHERE id = _id
     RETURNING vouchers.code, vouchers.duration_hours, vouchers.package_type, vouchers.status
          INTO code, duration_hours, package_type, status;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Pick an unused, unreserved voucher
  SELECT v.id INTO _id
  FROM public.vouchers v
  WHERE v.is_used = false
    AND v.package_type = _package_type
    AND (v.reserved_until IS NULL OR v.reserved_until < now())
  ORDER BY v.created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF _id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.vouchers
     SET status = 'reserved',
         reserved_until = now() + make_interval(mins => _hold_minutes),
         reserved_for_mac = _client_mac,
         reserved_for_session = _session_id,
         transaction_id = _transaction_id
   WHERE id = _id
   RETURNING vouchers.code, vouchers.duration_hours, vouchers.package_type, vouchers.status
        INTO code, duration_hours, package_type, status;

  RETURN NEXT;
END;
$$;

-- 4. Confirm voucher permanently used (called AFTER device confirms connectivity)
CREATE OR REPLACE FUNCTION public.confirm_voucher_used(
  _transaction_id uuid,
  _client_mac text
) RETURNS boolean
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  _ok boolean := false;
BEGIN
  UPDATE public.vouchers
     SET status = 'used',
         is_used = true,
         used_at = COALESCE(used_at, now()),
         used_by_mac = COALESCE(_client_mac, used_by_mac, reserved_for_mac),
         reserved_until = NULL
   WHERE transaction_id = _transaction_id
     AND status IN ('reserved','unused');
  GET DIAGNOSTICS _ok = ROW_COUNT;

  UPDATE public.transactions
     SET authenticated_at = now()
   WHERE id = _transaction_id;

  RETURN _ok;
END;
$$;

-- 5. Release stale reservations back into pool (call periodically; we also call inline)
CREATE OR REPLACE FUNCTION public.release_expired_reservations()
RETURNS integer LANGUAGE plpgsql SET search_path = public AS $$
DECLARE _n integer;
BEGIN
  UPDATE public.vouchers
     SET status = 'unused',
         reserved_until = NULL,
         reserved_for_mac = NULL,
         reserved_for_session = NULL,
         transaction_id = NULL
   WHERE status = 'reserved'
     AND is_used = false
     AND reserved_until IS NOT NULL
     AND reserved_until < now();
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$$;

-- 6. Resume: find latest paid/successful transaction for this MAC with a voucher
CREATE OR REPLACE FUNCTION public.resume_session_for_mac(_client_mac text)
RETURNS TABLE(
  transaction_id uuid,
  voucher_code text,
  package_type text,
  duration_hours integer,
  authenticated boolean,
  paid_at timestamptz
) LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT t.id, v.code, v.package_type, v.duration_hours,
         (t.authenticated_at IS NOT NULL),
         t.updated_at
    FROM public.transactions t
    JOIN public.vouchers v ON v.transaction_id = t.id
   WHERE t.client_mac = _client_mac
     AND t.status IN ('success','paid')
     AND v.status IN ('reserved','used')
     AND t.updated_at > now() - interval '24 hours'
   ORDER BY t.updated_at DESC
   LIMIT 1;
END;
$$;
