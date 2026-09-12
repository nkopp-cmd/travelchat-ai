-- Compare-and-swap the five editable fields without putting snapshots in URLs.
CREATE OR REPLACE FUNCTION public.save_itinerary_snapshot(
    p_itinerary_id UUID,
    p_expected JSONB,
    p_replacement JSONB
)
RETURNS SETOF public.itineraries
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    snapshot JSONB;
    field TEXT;
    expected_highlights TEXT[];
    replacement_highlights TEXT[];
BEGIN
    IF p_itinerary_id IS NULL THEN
        RAISE EXCEPTION 'Itinerary ID is required' USING ERRCODE = '22023';
    END IF;

    FOREACH snapshot IN ARRAY ARRAY[p_expected, p_replacement] LOOP
        IF snapshot IS NULL OR jsonb_typeof(snapshot) <> 'object'
            OR NOT (snapshot ?& ARRAY['title', 'city', 'activities', 'highlights', 'estimated_cost']) THEN
            RAISE EXCEPTION 'A complete itinerary snapshot is required' USING ERRCODE = '22023';
        END IF;
        FOREACH field IN ARRAY ARRAY['title', 'city', 'estimated_cost'] LOOP
            IF jsonb_typeof(snapshot -> field) NOT IN ('string', 'null') THEN
                RAISE EXCEPTION 'Invalid snapshot text field: %', field USING ERRCODE = '22023';
            END IF;
        END LOOP;
        IF jsonb_typeof(snapshot -> 'highlights') NOT IN ('array', 'null') THEN
            RAISE EXCEPTION 'Highlights must be a string array or null' USING ERRCODE = '22023';
        END IF;
        IF jsonb_typeof(snapshot -> 'highlights') = 'array' THEN
            IF EXISTS (SELECT 1 FROM jsonb_array_elements(snapshot -> 'highlights') AS item(value)
                WHERE jsonb_typeof(item.value) <> 'string') THEN
                RAISE EXCEPTION 'Highlights must contain only strings' USING ERRCODE = '22023';
            END IF;
        END IF;
    END LOOP;

    IF jsonb_typeof(p_replacement -> 'title') <> 'string'
        OR jsonb_typeof(p_replacement -> 'city') <> 'string'
        OR jsonb_typeof(p_replacement -> 'activities') NOT IN ('array', 'object') THEN
        RAISE EXCEPTION 'Replacement title, city and plan must be non-null and correctly typed' USING ERRCODE = '22023';
    END IF;

    -- ARRAY(SELECT ...) preserves empty arrays and decodes quotes/backslashes.
    -- Keep SQL NULL distinct from an empty text array.
    IF jsonb_typeof(p_expected -> 'highlights') = 'array' THEN
        expected_highlights := ARRAY(SELECT jsonb_array_elements_text(p_expected -> 'highlights'));
    END IF;
    IF jsonb_typeof(p_replacement -> 'highlights') = 'array' THEN
        replacement_highlights := ARRAY(SELECT jsonb_array_elements_text(p_replacement -> 'highlights'));
    END IF;

    RETURN QUERY
    UPDATE public.itineraries AS itinerary
    SET title = p_replacement ->> 'title',
        city = p_replacement ->> 'city',
        activities = p_replacement -> 'activities',
        highlights = replacement_highlights,
        estimated_cost = p_replacement ->> 'estimated_cost'
    WHERE itinerary.id = p_itinerary_id
        AND itinerary.clerk_user_id = (auth.jwt() ->> 'sub')
        AND itinerary.title IS NOT DISTINCT FROM (p_expected ->> 'title')
        AND itinerary.city IS NOT DISTINCT FROM (p_expected ->> 'city')
        AND itinerary.activities IS NOT DISTINCT FROM (p_expected -> 'activities')
        AND itinerary.highlights IS NOT DISTINCT FROM expected_highlights
        AND itinerary.estimated_cost IS NOT DISTINCT FROM (p_expected ->> 'estimated_cost')
    RETURNING itinerary.*;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.save_itinerary_snapshot(UUID, JSONB, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_itinerary_snapshot(UUID, JSONB, JSONB) TO authenticated;
