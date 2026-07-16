DROP POLICY IF EXISTS "Owners manage trip stops" ON public.trip_stops;
CREATE POLICY "Owners manage trip stops"
  ON public.trip_stops FOR ALL TO authenticated
  USING (trip_id IN (
    SELECT trip.id FROM public.trips trip
    WHERE trip.clerk_user_id = (SELECT auth.jwt() ->> 'sub')
  ))
  WITH CHECK (trip_id IN (
    SELECT trip.id FROM public.trips trip
    WHERE trip.clerk_user_id = (SELECT auth.jwt() ->> 'sub')
  ));

DROP POLICY IF EXISTS "Owners manage trip transfer legs" ON public.trip_transfer_legs;
CREATE POLICY "Owners manage trip transfer legs"
  ON public.trip_transfer_legs FOR ALL TO authenticated
  USING (trip_id IN (
    SELECT trip.id FROM public.trips trip
    WHERE trip.clerk_user_id = (SELECT auth.jwt() ->> 'sub')
  ))
  WITH CHECK (trip_id IN (
    SELECT trip.id FROM public.trips trip
    WHERE trip.clerk_user_id = (SELECT auth.jwt() ->> 'sub')
  ));

DROP POLICY IF EXISTS "Owners manage trip days" ON public.trip_days;
CREATE POLICY "Owners manage trip days"
  ON public.trip_days FOR ALL TO authenticated
  USING (trip_id IN (
    SELECT trip.id FROM public.trips trip
    WHERE trip.clerk_user_id = (SELECT auth.jwt() ->> 'sub')
  ))
  WITH CHECK (trip_id IN (
    SELECT trip.id FROM public.trips trip
    WHERE trip.clerk_user_id = (SELECT auth.jwt() ->> 'sub')
  ));

DROP POLICY IF EXISTS "Owners manage trip activities" ON public.trip_activities;
CREATE POLICY "Owners manage trip activities"
  ON public.trip_activities FOR ALL TO authenticated
  USING (trip_id IN (
    SELECT trip.id FROM public.trips trip
    WHERE trip.clerk_user_id = (SELECT auth.jwt() ->> 'sub')
  ))
  WITH CHECK (trip_id IN (
    SELECT trip.id FROM public.trips trip
    WHERE trip.clerk_user_id = (SELECT auth.jwt() ->> 'sub')
  ));
