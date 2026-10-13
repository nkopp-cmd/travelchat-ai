ALTER TABLE native_ai_requests ADD COLUMN purpose TEXT NOT NULL DEFAULT 'chat' CHECK(purpose IN ('chat','itinerary'));
ALTER TABLE native_ai_requests ADD COLUMN response_id TEXT;
ALTER TABLE native_ai_requests ADD COLUMN provider_status TEXT;
ALTER TABLE native_ai_requests ADD COLUMN input_tokens INTEGER CHECK(input_tokens IS NULL OR (typeof(input_tokens)='integer' AND input_tokens>=0));
ALTER TABLE native_ai_requests ADD COLUMN output_tokens INTEGER CHECK(output_tokens IS NULL OR (typeof(output_tokens)='integer' AND output_tokens>=0));
ALTER TABLE native_ai_requests ADD COLUMN cached_input_tokens INTEGER CHECK(cached_input_tokens IS NULL OR (typeof(cached_input_tokens)='integer' AND cached_input_tokens>=0 AND input_tokens IS NOT NULL AND cached_input_tokens<=input_tokens));
