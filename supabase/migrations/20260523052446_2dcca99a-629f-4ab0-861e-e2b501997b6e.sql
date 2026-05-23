-- 1) Reservation: exclude vouchers already touched by this MAC, atomic via SKIP LOCKED
CREATE OR REPLACE FUNCTION public.reserve_voucher_for_transaction(
  _transaction_id uuid,
  _package_type   text,
  _client_mac     text,
  _session_id     text,
  _hold_minutes   integer DEFAULT 10
)
RETURNS TABLE(code text, duration_hours integer, package_type text, status text)
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  _id uuid;
BEGIN
  -- Idempotency: same transaction already has a voucher
  SELECT v.id INTO _id
  FROM public.vouchers v
  WHERE v.transaction_id = _transaction_id
  LIMIT 1;

  IF _id IS NOT NULL THEN
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

  -- Atomically pick a voucher this MAC has NEVER been issued / reserved before
  SELECT v.id INTO _id
  FROM public.vouchers v
  WHERE v.is_used = false
    AND v.package_type = _package_type
    AND (v.reserved_until IS NULL OR v.reserved_until < now())
    AND (_client_mac IS NULL OR (
          COALESCE(v.used_by_mac, '')      <> _client_mac
      AND COALESCE(v.reserved_for_mac, '') <> _client_mac
    ))
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
$function$;

-- 2) Release voucher attached to a failed/cancelled/timed-out transaction
CREATE OR REPLACE FUNCTION public.release_voucher_for_transaction(_transaction_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE _n integer;
BEGIN
  UPDATE public.vouchers
     SET status = 'unused',
         is_used = false,
         reserved_until = NULL,
         reserved_for_mac = NULL,
         reserved_for_session = NULL,
         transaction_id = NULL,
         used_at = NULL,
         used_by_mac = NULL
   WHERE transaction_id = _transaction_id
     AND status = 'reserved';
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n > 0;
END;
$function$;