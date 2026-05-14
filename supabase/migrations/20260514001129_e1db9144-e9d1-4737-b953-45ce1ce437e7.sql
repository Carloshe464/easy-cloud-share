ALTER TABLE public.files ADD COLUMN IF NOT EXISTS external_url text;
ALTER TABLE public.files ALTER COLUMN storage_path DROP NOT NULL;