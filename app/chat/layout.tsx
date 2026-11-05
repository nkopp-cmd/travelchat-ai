import { QueryProvider } from "@/lib/query-client";

export default function ChatLayout({ children }: { children: React.ReactNode }) {
    return <QueryProvider>{children}</QueryProvider>;
}
