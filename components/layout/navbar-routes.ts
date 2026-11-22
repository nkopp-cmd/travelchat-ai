import { Map, Compass, Award, CreditCard, Languages } from "@/components/ui/icons";

export const routes = [
  { href: "/spots", label: "Explore", icon: Compass },
  { href: "/itineraries", label: "My trips", icon: Map },
  { href: "/help", label: "Help", icon: Languages },
  { href: "/pricing", label: "Pricing", icon: CreditCard },
  { href: "/profile", label: "Profile", icon: Award },
];
