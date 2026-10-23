"use client";

import { createContext } from "react";
import type { PlannerCity } from "@/lib/cities-catalog";

// Destination list rendered by the server with the planner page (app/itineraries/new), so the
// first screen needs no client fetch. null: the step loads it from /api/cities as before.
export const PlannerCitiesContext = createContext<PlannerCity[] | null>(null);
