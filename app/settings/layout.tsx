import { Sidebar } from "@/components/layout/sidebar";

export default function SettingsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="flex">
            <Sidebar />
            <div className="flex-1">{children}</div>
        </div>
    );
}
