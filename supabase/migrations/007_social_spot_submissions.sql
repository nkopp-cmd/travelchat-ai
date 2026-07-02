-- Social spot submissions, contributor attribution, and contribution credits.
-- Public clients submit through the Next.js API route; writes are performed
-- server-side with the service role.

CREATE TABLE IF NOT EXISTS public.spot_contributors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  display_name TEXT,
  public_credit_name TEXT NOT NULL,
  total_tokens INTEGER NOT NULL DEFAULT 0 CHECK (total_tokens >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_submitted_at TIMESTAMPTZ,
  CONSTRAINT spot_contributors_email_normalized CHECK (email = lower(trim(email))),
  CONSTRAINT spot_contributors_email_unique UNIQUE (email)
);

CREATE TABLE IF NOT EXISTS public.social_spot_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contributor_id UUID NOT NULL REFERENCES public.spot_contributors(id) ON DELETE CASCADE,
  clerk_user_id TEXT,
  spot_id UUID REFERENCES public.spots(id) ON DELETE SET NULL,
  source_url TEXT NOT NULL,
  canonical_url TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('instagram', 'tiktok')),
  status TEXT NOT NULL CHECK (
    status IN ('spot_created', 'spot_reused', 'needs_review', 'research_pending')
  ),
  contributor_credit TEXT NOT NULL,
  token_awarded INTEGER NOT NULL DEFAULT 0 CHECK (token_awarded >= 0),
  notes TEXT,
  city_hint TEXT,
  extracted_name TEXT,
  extracted_address TEXT,
  extracted_city TEXT,
  localley_score INTEGER CHECK (localley_score BETWEEN 1 AND 6),
  local_percentage INTEGER CHECK (local_percentage BETWEEN 0 AND 100),
  research_confidence NUMERIC(3, 2) CHECK (research_confidence BETWEEN 0 AND 1),
  research_summary TEXT,
  research JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT social_spot_submissions_canonical_unique UNIQUE (canonical_url)
);

CREATE TABLE IF NOT EXISTS public.contribution_token_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contributor_id UUID NOT NULL REFERENCES public.spot_contributors(id) ON DELETE CASCADE,
  submission_id UUID NOT NULL REFERENCES public.social_spot_submissions(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL CHECK (delta <> 0),
  reason TEXT NOT NULL CHECK (reason IN ('social_spot_submission', 'admin_adjustment', 'token_redemption')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT contribution_token_ledger_submission_unique UNIQUE (submission_id, reason)
);

CREATE INDEX IF NOT EXISTS idx_social_spot_submissions_contributor
  ON public.social_spot_submissions(contributor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_social_spot_submissions_spot
  ON public.social_spot_submissions(spot_id)
  WHERE spot_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_social_spot_submissions_status
  ON public.social_spot_submissions(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contribution_token_ledger_contributor
  ON public.contribution_token_ledger(contributor_id, created_at DESC);

ALTER TABLE public.spot_contributors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_spot_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contribution_token_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages spot contributors" ON public.spot_contributors;
CREATE POLICY "Service role manages spot contributors"
  ON public.spot_contributors
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service role manages social spot submissions" ON public.social_spot_submissions;
CREATE POLICY "Service role manages social spot submissions"
  ON public.social_spot_submissions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Service role manages contribution token ledger" ON public.contribution_token_ledger;
CREATE POLICY "Service role manages contribution token ledger"
  ON public.contribution_token_ledger
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.spot_contributors TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.social_spot_submissions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.contribution_token_ledger TO service_role;

CREATE OR REPLACE FUNCTION public.update_social_submission_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS spot_contributors_updated_at ON public.spot_contributors;
CREATE TRIGGER spot_contributors_updated_at
  BEFORE UPDATE ON public.spot_contributors
  FOR EACH ROW
  EXECUTE FUNCTION public.update_social_submission_updated_at();

DROP TRIGGER IF EXISTS social_spot_submissions_updated_at ON public.social_spot_submissions;
CREATE TRIGGER social_spot_submissions_updated_at
  BEFORE UPDATE ON public.social_spot_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_social_submission_updated_at();

COMMENT ON TABLE public.spot_contributors IS 'People who submit social links to Localley, keyed by normalized email.';
COMMENT ON TABLE public.social_spot_submissions IS 'TikTok/Instagram links submitted for AI-assisted Localley spot research and attribution.';
COMMENT ON TABLE public.contribution_token_ledger IS 'Idempotent credit ledger for contribution rewards and future token redemptions.';
