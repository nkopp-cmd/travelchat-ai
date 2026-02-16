import { SignUp } from "@clerk/nextjs";
import { Logo } from "@/components/brand/logo";

export default function SignUpPage() {
    return (
        <div className="min-h-dvh flex items-center justify-center bg-background p-4">
            {/* Background effects */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-violet-600/10 rounded-full blur-3xl" />
                <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl" />
            </div>

            <div className="relative w-full max-w-md z-10">
                {/* Logo */}
                <div className="flex justify-center mb-6">
                    <Logo size="lg" showText={false} href={undefined} />
                </div>

                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold text-white mb-2">
                        Join Localley
                    </h1>
                    <p className="text-gray-400">
                        Start discovering hidden gems like a local
                    </p>
                </div>

                <div className="bg-card/50 backdrop-blur-xl rounded-3xl shadow-2xl shadow-violet-500/10 p-8 border border-white/10">
                    <SignUp
                        appearance={{
                            elements: {
                                rootBox: "w-full",
                                card: "shadow-none bg-transparent",
                                headerTitle: "hidden",
                                headerSubtitle: "hidden",
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
                        path="/sign-up"
                        signInUrl="/sign-in"
                    />
                </div>

                <p className="text-center text-sm text-gray-500 mt-6">
                    By signing up, you agree to our Terms of Service and Privacy Policy
                </p>
            </div>
        </div>
    );
}
