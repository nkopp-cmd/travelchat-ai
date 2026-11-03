import type { ComponentType } from "react";
import { Camera, Coffee, MapPin, Moon, ShoppingBag, Store, Ticket, Train, Trees, Utensils, type IconProps } from "@/components/ui/icons";
import type { PinTone } from "@/lib/spots/pin-clusters";

/** One icon per category tone: map pins, pin cards and the photo tile share it. */
export const TONE_ICONS: Record<PinTone, ComponentType<IconProps>> = {
    food: Utensils, cafe: Coffee, nightlife: Moon, shopping: ShoppingBag, market: Store,
    outdoor: Trees, culture: Camera, entertainment: Ticket, transport: Train, other: MapPin,
};
