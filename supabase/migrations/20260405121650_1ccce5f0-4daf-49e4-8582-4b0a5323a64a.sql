
CREATE TABLE public.client_authorizations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mac_address TEXT,
  client_ip TEXT,
  ap_mac TEXT,
  ssid TEXT,
  phone_number TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  package_type TEXT NOT NULL DEFAULT '2hour',
  duration_hours INTEGER NOT NULL DEFAULT 2,
  payment_status TEXT NOT NULL DEFAULT 'unpaid',
  authorization_status TEXT NOT NULL DEFAULT 'no',
  checkout_request_id TEXT,
  mpesa_receipt TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.client_authorizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public select" ON public.client_authorizations FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.client_authorizations FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.client_authorizations FOR UPDATE USING (true);
