"use client";

import { UserMenu } from "@/components/auth/user-menu";
import { SubscriptionBadge } from "@/components/subscription";
import { NotificationCenter } from "@/components/notifications/notification-center";

// Signed-in controls load in their own chunk so signed-out visitors never download them.
export function NavbarAccount() {
  return <><SubscriptionBadge className="hidden sm:flex" /><NotificationCenter /><UserMenu /></>;
}
