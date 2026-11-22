import { QueryProvider } from "@/lib/query-client";

export default function ItinerariesQueryLayout({ children }: { children: React.ReactNode }) {
    return <QueryProvider>{children}</QueryProvider>;
}
