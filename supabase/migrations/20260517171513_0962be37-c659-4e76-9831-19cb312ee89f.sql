CREATE TABLE public.stream_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_url TEXT NOT NULL,
  resolved_url TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('hls','mp4')),
  headers JSONB NOT NULL DEFAULT '{}'::jsonb,
  resolver TEXT NOT NULL DEFAULT 'worker',
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX stream_cache_source_url_idx ON public.stream_cache (source_url);
CREATE INDEX stream_cache_expires_at_idx ON public.stream_cache (expires_at);

ALTER TABLE public.stream_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stream_cache read all"
  ON public.stream_cache FOR SELECT
  USING (true);

CREATE POLICY "stream_cache write authenticated"
  ON public.stream_cache FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');