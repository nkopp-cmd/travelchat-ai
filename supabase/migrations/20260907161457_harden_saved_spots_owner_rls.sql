BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
LOCK TABLE public.saved_spots IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.saved_spots'::regclass) THEN
    RAISE EXCEPTION 'saved_spots RLS must already be enabled';
  END IF;
  -- Permissive policies combine with OR; an unknown one could bypass ownership.
  IF EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.saved_spots'::regclass AND polpermissive
      AND polname NOT IN (
        'Users can save spots', 'Users can unsave spots', 'Users can view own saved spots'
      )
  ) THEN
    RAISE EXCEPTION 'Unexpected permissive saved_spots policy; review before migration';
  END IF;
END;
$$;

DROP POLICY IF EXISTS "Users can save spots" ON public.saved_spots;
DROP POLICY IF EXISTS "Users can unsave spots" ON public.saved_spots;
DROP POLICY IF EXISTS "Users can view own saved spots" ON public.saved_spots;

CREATE POLICY "Users can save spots" ON public.saved_spots
  FOR INSERT TO authenticated
  WITH CHECK (clerk_user_id = (SELECT auth.jwt()->>'sub'));

CREATE POLICY "Users can unsave spots" ON public.saved_spots
  FOR DELETE TO authenticated
  USING (clerk_user_id = (SELECT auth.jwt()->>'sub'));

CREATE POLICY "Users can view own saved spots" ON public.saved_spots
  FOR SELECT TO authenticated
  USING (clerk_user_id = (SELECT auth.jwt()->>'sub'));

-- No UPDATE policy: clients cannot reassign ownership. Existing grants and
-- service_role BYPASSRLS access remain unchanged.
COMMIT;
