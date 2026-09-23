import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { AppBackground } from "@/components/layout/app-background";

export function AuthShell({ title, subtitle, children, footer }: {
    title: string;
    subtitle: string;
    children: ReactNode;
    footer?: ReactNode;
}) {
    return (
        <AppBackground ambient className="min-h-dvh" contentClassName="flex min-h-dvh items-center justify-center p-4">
            <div className="relative z-10 w-full max-w-md">
                <div className="flex justify-center mb-6">
                    <Logo size="lg" showText={false} href={undefined} />
                </div>
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-white mb-2">{title}</h1>
                    <p className="text-gray-400">{subtitle}</p>
                </div>
                <div className="overflow-hidden rounded-lg border border-white/[0.15] bg-card/80 p-6 shadow-2xl shadow-violet-500/20 backdrop-blur-xl sm:p-8">
                    {children}
                </div>
                {footer ?? (
                    <p className="text-center text-sm text-gray-500 mt-6">
                        By continuing, you agree to our Terms of Service and Privacy Policy
                    </p>
                )}
            </div>
        </AppBackground>
    );
}
