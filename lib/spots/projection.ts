/** Public catalog fields only. Geography joins expose display names, never owner identifiers. */
export const PUBLIC_SPOT_SELECT = "id,name,description,location,address,category,subcategories,localley_score,local_percentage,best_times,photos,tips,verified,trending_score,created_at,review_count,average_rating,name_en_normalized,address_en_normalized,google_place_id,destination_id,local_area_id";

/** Display joins are needed for cards, not count/filter scans. */
export const PUBLIC_SPOT_CARD_SELECT = `${PUBLIC_SPOT_SELECT},destination:geo_destinations!spots_destination_id_fk(name,slug),localArea:geo_local_areas!spots_local_area_destination_fk(name)` as const;
