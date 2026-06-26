import { SignIn } from "@clerk/nextjs";
import { Logo } from "@/components/brand/logo";
import { AppBackground } from "@/components/layout/app-background";

export default function SignInPage() {
    return (
        <AppBackground ambient className="min-h-dvh" contentClassName="flex min-h-dvh items-center justify-center p-4">
            <div className="relative z-10 w-full max-w-md">
                <div className="flex justify-center mb-6">
                    <Logo size="lg" showText={false} href={undefined} />
                </div>

                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-white mb-2">
                        Welcome Back
                    </h1>
                    <p className="text-gray-400">
                        Sign in to continue your local adventures
                    </p>
                </div>

                <div className="overflow-hidden rounded-lg border border-white/[0.15] bg-card/80 p-6 shadow-2xl shadow-violet-500/20 backdrop-blur-xl sm:p-8">
                    <SignIn
                        appearance={{
                            elements: {
                                rootBox: "w-full",
                                cardBox: "w-full max-w-full",
                                card: "shadow-none bg-transparent w-full",
                                headerTitle: "hidden",
                                headerSubtitle: "hidden",
                                logoBox: "hidden",
                                socialButtonsBlockButton: "bg-white/10 border border-white/20 text-white hover:bg-white/20",
                                socialButtonsBlockButtonText: "text-white",
                                formButtonPrimary: "bg-violet-600 hover:bg-violet-700 text-white",
                                formFieldInput: "bg-white/10 border-white/20 text-white placeholder:text-gray-500",
                                formFieldLabel: "text-gray-300",
                                footerActionLink: "text-violet-400 hover:text-violet-300",
                                identityPreviewText: "text-white",
                                identityPreviewEditButton: "text-violet-400 hover:text-violet-300",
                                formFieldInputShowPasswordButton: "text-gray-400 hover:text-gray-300",
                                dividerLine: "bg-white/20",
                                dividerText: "text-gray-400",
                                otpCodeFieldInput: "bg-white/10 border-white/20 text-white",
                            },
                        }}
                        routing="path"
                        path="/sign-in"
                        signUpUrl="/sign-up"
                    />
                </div>

                <p className="text-center text-sm text-gray-500 mt-6">
                    By signing in, you agree to our Terms of Service and Privacy Policy
                </p>
            </div>
        </AppBackground>
    );
}
