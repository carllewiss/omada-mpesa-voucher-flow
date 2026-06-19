
-- Tighten claim_voucher_for_package so a device is never re-issued a voucher it previously held
CREATE OR REPLACE FUNCTION public.claim_voucher_for_package(_package_type text, _client_mac text DEFAULT NULL::text)
 RETURNS TABLE(code text, duration_hours integer, package_type text)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  _claimed_id uuid;
BEGIN
  SELECT v.id INTO _claimed_id
  FROM public.vouchers v
  WHERE v.is_used = false
    AND v.package_type = _package_type
    AND (_client_mac IS NULL OR (
          COALESCE(v.used_by_mac, '')      <> _client_mac
      AND COALESCE(v.reserved_for_mac, '') <> _client_mac
    ))
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
$function$;

-- New: swap a rejected voucher (post M-Pesa) for the next available one,
-- guaranteeing the same MAC never receives a voucher it has already been issued.
CREATE OR REPLACE FUNCTION public.swap_voucher_for_mpesa(
  _checkout_request_id text,
  _client_mac text,
  _rejected_code text
)
 RETURNS TABLE(code text, duration_hours integer, package_type text)
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  _pkg text;
  _new_id uuid;
BEGIN
  -- Burn the rejected voucher so it can never be handed out again
  UPDATE public.vouchers
     SET status = 'used',
         is_used = true,
         used_at = COALESCE(used_at, now()),
         used_by_mac = COALESCE(used_by_mac, _client_mac)
   WHERE code = _rejected_code;

  -- Find the package type for this transaction (from the rejected voucher, else from the tx)
  SELECT v.package_type INTO _pkg
    FROM public.vouchers v
   WHERE v.code = _rejected_code
   LIMIT 1;

  IF _pkg IS NULL THEN
    SELECT t.package_type INTO _pkg
      FROM public.transactions t
     WHERE t.checkout_request_id = _checkout_request_id
     LIMIT 1;
  END IF;

  IF _pkg IS NULL THEN
    RETURN;
  END IF;

  -- Claim the next available voucher this MAC has never received
  SELECT v.id INTO _new_id
  FROM public.vouchers v
  WHERE v.is_used = false
    AND v.package_type = _pkg
    AND v.code <> _rejected_code
    AND (_client_mac IS NULL OR (
          COALESCE(v.used_by_mac, '')      <> _client_mac
      AND COALESCE(v.reserved_for_mac, '') <> _client_mac
    ))
  ORDER BY v.created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF _new_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.vouchers
     SET status = 'used',
         is_used = true,
         used_at = now(),
         used_by_mac = _client_mac
   WHERE id = _new_id
  RETURNING vouchers.code, vouchers.duration_hours, vouchers.package_type
       INTO code, duration_hours, package_type;

  -- Update the authorization record so the new voucher is reflected (and idempotent re-polls return it)
  UPDATE public.client_authorizations
     SET mpesa_receipt = 'VC-' || code,
         updated_at = now()
   WHERE checkout_request_id = _checkout_request_id;

  -- Mirror onto transactions for traceability
  UPDATE public.transactions
     SET voucher_code = code,
         updated_at = now()
   WHERE checkout_request_id = _checkout_request_id;

  RETURN NEXT;
END;
$function$;
