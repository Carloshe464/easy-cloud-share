ALTER TABLE public.files ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_files_is_public ON public.files (is_public) WHERE is_public = true;