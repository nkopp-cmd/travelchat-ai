ALTER TABLE spots ADD COLUMN city TEXT;
ALTER TABLE spots ADD COLUMN address TEXT;
ALTER TABLE spots ADD COLUMN latitude REAL CHECK(latitude IS NULL OR (typeof(latitude) IN ('real', 'integer') AND latitude BETWEEN -90 AND 90));
ALTER TABLE spots ADD COLUMN longitude REAL CHECK(longitude IS NULL OR (typeof(longitude) IN ('real', 'integer') AND longitude BETWEEN -180 AND 180));
ALTER TABLE spots ADD COLUMN photo_credits TEXT CHECK(photo_credits IS NULL OR (json_valid(photo_credits) AND json_type(photo_credits) = 'array'));
ALTER TABLE spots ADD COLUMN source_urls TEXT CHECK(source_urls IS NULL OR (json_valid(source_urls) AND json_type(source_urls) = 'array'));
