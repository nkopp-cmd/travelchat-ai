-- Google listing IDs taken from the live catalog's own photo references (source snapshot 2026-09-21).
-- The Worker still rejects any listing more than 1 km from the D1 catalog coordinates.
-- Idempotent: existing associations are never overwritten.
INSERT INTO spot_listing_places (spot_id, provider, place_id, source)
SELECT v.spot_id, 'google', v.place_id, v.source FROM (
  SELECT '0041a575-c6fd-4a7e-b9c3-56cc50e201d6' AS spot_id, 'ChIJnwNS1oKifDURA3ZlINZqXew' AS place_id, 'live catalog photo reference, same spot UUID' AS source
  UNION ALL SELECT '7f258ce1-b46c-4ab7-96ce-02a5fe5d6b67', 'ChIJm3V0fu2ifDURRJ8IMUijVtY', 'live catalog photo reference, same spot UUID'
  UNION ALL SELECT 'c6a455dc-4b18-4e29-a36b-7430f2ba8f3b', 'ChIJ8xRYr29FezUR3AtFqx2pIlw', 'live catalog photo reference, same spot UUID'
  UNION ALL SELECT 'cbd403a4-1912-45b8-8ae1-fc13b4c2f1e5', 'ChIJod7tSseifDUR9hXHLFNGMIs', 'live catalog google_place_id and photo reference, same spot UUID'
  UNION ALL SELECT 'f0fcf98e-76d7-4673-b8c3-6baf519a1551', 'ChIJIwCT4-yifDUR1E63iG76hr0', 'live catalog photo reference of the related Cheonggyecheon night-walk spot'
) v
WHERE EXISTS (SELECT 1 FROM spots s WHERE s.id = v.spot_id AND s.visible = 1)
  AND NOT EXISTS (SELECT 1 FROM spot_listing_places l WHERE l.spot_id = v.spot_id);
