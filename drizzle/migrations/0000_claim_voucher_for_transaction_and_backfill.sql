-- Idempotent, transaction-bound voucher claim (server-side, browser independent)
CREATE OR REPLACE FUNCTION public.claim_voucher_for_transaction(
  _transaction_id uuid,
  _package_type text,
  _client_mac text DEFAULT NULL
)
RETURNS TABLE(code text, duration_hours integer, package_type text)
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  _id uuid;
BEGIN
  -- Already issued for this transaction? return it (idempotent)
  SELECT v.id INTO _id
  FROM public.vouchers v
  WHERE v.transaction_id = _transaction_id
  LIMIT 1;

  IF _id IS NULL THEN
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
  END IF;

  UPDATE public.vouchers v
     SET status = 'used',
         is_used = true,
         used_at = COALESCE(v.used_at, now()),
         used_by_mac = COALESCE(v.used_by_mac, _client_mac),
         transaction_id = _transaction_id,
         reserved_until = NULL
   WHERE v.id = _id
  RETURNING v.code, v.duration_hours, v.package_type
       INTO code, duration_hours, package_type;

  UPDATE public.transactions t
     SET voucher_code = code,
         updated_at = now()
   WHERE t.id = _transaction_id
     AND t.voucher_code IS DISTINCT FROM code;

  RETURN NEXT;
END;
$$;

-- Backfill: link already-issued vouchers to their transactions so MAC resume works
UPDATE public.vouchers v
   SET transaction_id = t.id
  FROM public.transactions t
  JOIN public.client_authorizations ca
    ON ca.checkout_request_id = t.checkout_request_id
 WHERE v.transaction_id IS NULL
   AND ca.mpesa_receipt = 'VC-' || v.code;

UPDATE public.transactions t
   SET voucher_code = v.code
  FROM public.vouchers v
 WHERE v.transaction_id = t.id
   AND t.voucher_code IS NULL;
