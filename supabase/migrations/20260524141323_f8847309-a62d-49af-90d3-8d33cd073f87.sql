ALTER TABLE public.files REPLICA IDENTITY FULL;
ALTER TABLE public.folders REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.files;
ALTER PUBLICATION supabase_realtime ADD TABLE public.folders;