-- Explicit reviewed update only, after the exact JPEG and license notice are deployed.
-- Preserve the original UUID, facts, coordinates, visibility, and all relationships.
UPDATE spots SET
  description = '{"en":"This historic park contains Independence Gate and memorials to Korean independence activists. Seodaemun Prison History Hall explains the site''s colonial history. The historical photograph shows park pathways and memorials on June 16, 2018, not current conditions or an entrance."}',
  photos = '["/pilot/0041a575-c6fd-4a7e-b9c3-56cc50e201d6.jpg"]',
  photo_credits = '[{"url":"/pilot/0041a575-c6fd-4a7e-b9c3-56cc50e201d6.jpg","author":"\uc720\uc790\ucc28","license":"CC BY-SA 4.0","licenseUrl":"https://creativecommons.org/licenses/by-sa/4.0/","sourceUrl":"https://commons.wikimedia.org/wiki/File:%EC%84%9C%EB%8C%80%EB%AC%B8%EB%8F%85%EB%A6%BD%EA%B3%B5%EC%9B%90%EC%9D%98_%EB%AA%A8%EC%8A%B5.jpg","takenAt":"2018-06-16"}]'
WHERE id = '0041a575-c6fd-4a7e-b9c3-56cc50e201d6'
  AND EXISTS (SELECT 1 FROM runtime_purpose WHERE id = 1 AND purpose = 'localley-preview')
  AND name = '{"en":"Seodaemun Independence Park"}'
  AND description = '{"en":"This historic park contains Independence Gate and memorials to Korean independence activists. Seodaemun Prison History Hall explains the site''s colonial history."}'
  AND category = 'park' AND city = 'Seoul' AND visible = 1 AND localley_score IS NULL
  AND address = '251, Tongil-ro, Seodaemun-gu, Seoul'
  AND latitude = 37.5752858 AND longitude = 126.9550192
  AND photos = '[]' AND photo_credits = '[]'
  AND source_urls = '["https://english.visitseoul.net/attractions/Seodaemun-Independence-Park/ENP001753","https://www.wikidata.org/wiki/Q623629"]';
