
CREATE TABLE public.vouchers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  package_type TEXT NOT NULL DEFAULT '2hour',
  duration_hours INTEGER NOT NULL DEFAULT 2,
  status TEXT NOT NULL DEFAULT 'unused',
  used_by_mac TEXT,
  used_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public select" ON public.vouchers FOR SELECT USING (true);
CREATE POLICY "Allow public update" ON public.vouchers FOR UPDATE USING (true);
CREATE POLICY "Allow public insert" ON public.vouchers FOR INSERT WITH CHECK (true);
