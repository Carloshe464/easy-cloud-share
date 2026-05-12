
CREATE OR REPLACE FUNCTION public.update_user_used_bytes()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
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
