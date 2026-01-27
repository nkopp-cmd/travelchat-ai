"use client";

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Check, Sparkles, MapPin, Clock, Share2 } from "lucide-react";

interface SignupPromptSheetProps {
  isOpen: boolean;
  onClose: () => void;
  itineraryTitle?: string;
}

const benefits = [
  {
    icon: MapPin,
    text: "Save this itinerary to your account",
  },
  {
    icon: Sparkles,
    text: "Get 3 free AI-generated trips per month",
  },
  {
    icon: Clock,
    text: "Access your trips from any device",
  },
  {
    icon: Share2,
    text: "Share itineraries with friends & family",
  },
];

export function SignupPromptSheet({
  isOpen,
  onClose,
  itineraryTitle,
}: SignupPromptSheetProps) {
  const router = useRouter();

  const handleSignUp = () => {
    // Store a flag to claim the itinerary after signup
    localStorage.setItem("claimItineraryAfterSignup", "true");
    router.push("/sign-up?redirect=/itineraries/claim");
  };

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent
        side="bottom"
        className={cn(
          "rounded-t-3xl border-t border-white/10",
          "bg-card/95 backdrop-blur-xl",
          "px-6 pb-8 pt-6",
          "max-h-[85vh]"
        )}
      >
        <div className="mx-auto w-12 h-1.5 bg-white/20 rounded-full mb-6" />

        <SheetHeader className="text-center mb-6">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
          </div>
          <SheetTitle className="text-2xl font-bold text-white">
            Your itinerary is ready!
          </SheetTitle>
          <SheetDescription className="text-gray-400">
            {itineraryTitle
              ? `"${itineraryTitle}" has been created`
              : "Sign up to save it and unlock more features"}
          </SheetDescription>
        </SheetHeader>

        {/* Benefits list */}
        <div className="space-y-3 mb-8">
          {benefits.map((benefit, index) => (
            <div
              key={index}
              className="flex items-center gap-3 p-3 rounded-xl bg-white/5"
            >
              <div className="w-10 h-10 rounded-lg bg-violet-600/20 flex items-center justify-center shrink-0">
                <benefit.icon className="w-5 h-5 text-violet-400" />
              </div>
              <span className="text-sm text-gray-300">{benefit.text}</span>
              <Check className="w-5 h-5 text-green-400 ml-auto shrink-0" />
            </div>
          ))}
        </div>

        {/* Action buttons */}
        <div className="space-y-3">
          <Button
            onClick={handleSignUp}
            className={cn(
              "w-full h-14 text-lg font-semibold",
              "bg-gradient-to-r from-violet-600 to-indigo-600",
              "hover:from-violet-500 hover:to-indigo-500",
              "shadow-lg shadow-violet-500/30"
            )}
          >
            Sign Up Free
          </Button>
          <Button
            variant="ghost"
            onClick={onClose}
            className="w-full text-gray-400 hover:text-white hover:bg-white/5"
          >
            Maybe Later
          </Button>
        </div>

        <p className="text-center text-xs text-gray-500 mt-4">
          Your itinerary will be saved locally until you sign up
        </p>
      </SheetContent>
    </Sheet>
  );
}
