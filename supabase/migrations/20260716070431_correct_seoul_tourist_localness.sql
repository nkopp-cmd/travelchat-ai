UPDATE public.spots
SET
  localley_score = 2,
  local_percentage = 30,
  subcategories = CASE
    WHEN 'Tourist-heavy' = ANY(COALESCE(subcategories, ARRAY[]::TEXT[])) THEN subcategories
    ELSE array_append(COALESCE(subcategories, ARRAY[]::TEXT[]), 'Tourist-heavy')
  END
WHERE name->>'en' = 'Gwangjang Market Bindaetteok Alley';
