import { Map, Compass, Award, Settings, CreditCard, Sparkles, Languages } from "@/components/ui/icons";

export const routes = [
  { href: "/spots", label: "Explore", icon: Compass },
  { href: "/itineraries", label: "My trips", icon: Map },
  { href: "/help", label: "Help", icon: Languages },
  { href: "/pricing", label: "Pricing", icon: CreditCard },
  { href: "/profile", label: "Profile", icon: Award },
];
export const mobileRoutes = [
  ...routes,
  { href: "/templates", label: "Templates", icon: Sparkles },
  { href: "/settings", label: "Settings", icon: Settings },
];
