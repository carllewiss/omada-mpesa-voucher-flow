
ALTER TABLE public.vouchers
  ADD COLUMN IF NOT EXISTS resume_token_hash text,
  ADD COLUMN IF NOT EXISTS resume_token_mac_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS resume_token_macs text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS vouchers_resume_token_hash_idx
  ON public.vouchers (resume_token_hash)
  WHERE resume_token_hash IS NOT NULL;

CREATE OR REPLACE FUNCTION public.resume_session_by_token(_token_hash text, _client_mac text)
RETURNS TABLE(voucher_code text, package_type text, duration_hours integer, paid_at timestamp with time zone)
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  _v_id uuid;
  _used_at timestamp with time zone;
  _duration integer;
  _macs text[];
  _mac_count integer;
BEGIN
  IF _token_hash IS NULL OR length(_token_hash) < 32 THEN
    RETURN;
  END IF;

  SELECT v.id, v.used_at, v.duration_hours, v.resume_token_macs, v.resume_token_mac_count
    INTO _v_id, _used_at, _duration, _macs, _mac_count
    FROM public.vouchers v
   WHERE v.resume_token_hash = _token_hash
     AND v.status = 'used'
   LIMIT 1;

  IF _v_id IS NULL THEN
    RETURN;
  END IF;

  -- Package-duration sensitive: token dies with its own voucher window
  IF _used_at IS NULL OR (_used_at + make_interval(hours => COALESCE(_duration, 2))) < now() THEN
    RETURN;
  END IF;

  -- Cap distinct devices per token
  IF _client_mac IS NOT NULL AND NOT (_client_mac = ANY(_macs)) THEN
    IF COALESCE(_mac_count, 0) >= 5 THEN
      RETURN;
    END IF;
    UPDATE public.vouchers
       SET resume_token_macs = array_append(_macs, _client_mac),
           resume_token_mac_count = COALESCE(_mac_count, 0) + 1,
           used_by_mac = COALESCE(used_by_mac, _client_mac)
     WHERE id = _v_id;
  END IF;

  RETURN QUERY
    SELECT v.code, v.package_type, v.duration_hours, v.used_at
      FROM public.vouchers v
     WHERE v.id = _v_id;
END;
$$;
