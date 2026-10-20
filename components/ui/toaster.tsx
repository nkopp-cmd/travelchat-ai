"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useToast } from "@/hooks/use-toast";

// Radix Toast loads with the first toast, not with every page.
const RadixToaster = dynamic(() => import("@/components/ui/radix-toaster").then((module) => module.RadixToaster), { ssr: false });

export function Toaster() {
    const { toasts } = useToast();
    const [needed, setNeeded] = useState(false);
    if (!needed && toasts.length > 0) setNeeded(true);
    return needed ? <RadixToaster /> : null;
}
