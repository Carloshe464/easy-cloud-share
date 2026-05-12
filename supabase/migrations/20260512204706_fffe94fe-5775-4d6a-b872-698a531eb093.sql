
-- Users identified by phone (no auth)
CREATE TABLE public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL UNIQUE,
  used_bytes BIGINT NOT NULL DEFAULT 0,
  quota_bytes BIGINT NOT NULL DEFAULT 4398046511104, -- 4 TB
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.folders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_folders_user ON public.folders(user_id);
CREATE INDEX idx_folders_parent ON public.folders(parent_id);

CREATE TABLE public.files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  folder_id UUID REFERENCES public.folders(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  storage_path TEXT NOT NULL UNIQUE,
  mime_type TEXT,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  share_token TEXT NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_files_user ON public.files(user_id);
CREATE INDEX idx_files_folder ON public.files(folder_id);
CREATE INDEX idx_files_share ON public.files(share_token);

-- RLS: enable but allow anonymous full access (app-level ownership)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public all users" ON public.users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public all folders" ON public.folders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public all files" ON public.files FOR ALL USING (true) WITH CHECK (true);

-- Storage bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('cloud-files', 'cloud-files', true, 53687091200) -- 50 GB single file cap
ON CONFLICT (id) DO UPDATE SET public = true, file_size_limit = 53687091200;

CREATE POLICY "public read cloud-files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'cloud-files');
CREATE POLICY "public insert cloud-files"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'cloud-files');
CREATE POLICY "public update cloud-files"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'cloud-files');
CREATE POLICY "public delete cloud-files"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'cloud-files');

-- Quota maintenance triggers
CREATE OR REPLACE FUNCTION public.update_user_used_bytes()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE public.users SET used_bytes = used_bytes + NEW.size_bytes WHERE id = NEW.user_id;
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE public.users SET used_bytes = GREATEST(0, used_bytes - OLD.size_bytes) WHERE id = OLD.user_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_files_quota
AFTER INSERT OR DELETE ON public.files
FOR EACH ROW EXECUTE FUNCTION public.update_user_used_bytes();
