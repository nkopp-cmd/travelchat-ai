CREATE INDEX IF NOT EXISTS idx_social_spot_submission_media_jobs_media_fk
  ON public.social_spot_submission_media_jobs(submission_id, media_id);
