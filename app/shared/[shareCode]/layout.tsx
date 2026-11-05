import { QueryProvider } from "@/lib/query-client";

export default function SharedItineraryLayout({ children }: { children: React.ReactNode }) {
    return <QueryProvider>{children}</QueryProvider>;
}
