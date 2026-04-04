
CREATE TABLE public.transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_number TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  package_type TEXT NOT NULL DEFAULT '2hour',
  checkout_request_id TEXT,
  merchant_request_id TEXT,
  mpesa_receipt TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  result_desc TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- Public access since this is a captive portal (no auth)
CREATE POLICY "Allow public insert" ON public.transactions FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public select" ON public.transactions FOR SELECT USING (true);
CREATE POLICY "Allow public update" ON public.transactions FOR UPDATE USING (true);
