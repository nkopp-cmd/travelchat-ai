import { auth } from "@/lib/auth/server";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { createSupabaseAdmin } from "@/lib/supabase";
import { isPreviewItineraryListCandidate } from "@/lib/app-data/preview-itinerary-list";
import { isPreviewEditorIntent, previewItineraryEditor } from "@/lib/app-data/preview-itinerary-editor";
import { EditForm } from "@/components/itineraries/edit-form";

export async function generateMetadata({ searchParams }: { searchParams?: Promise<{data_candidate?: string}> }) {
    return isPreviewEditorIntent((await headers()).get("host"), (await searchParams)?.data_candidate)
        ? { title: "Edit your itinerary - Localley", robots: { index: false, follow: false } } : {};
}

export default async function EditItineraryPage({
    params, searchParams,
}: {
    params: Promise<{ id: string }>;
    searchParams?: Promise<{ data_candidate?: string }>;
}) {
    const host = (await headers()).get("host"), flag = (await searchParams)?.data_candidate;
    if (isPreviewEditorIntent(host, flag)) {
        if (!isPreviewItineraryListCandidate(host, flag)) return <div role="status" className="rounded-xl border p-6">Your itinerary is currently unavailable.</div>;
        const { userId } = await auth();
        const { id } = await params;
        let itinerary;
        try { itinerary = await previewItineraryEditor(id, userId); }
        catch { return <div role="status" className="rounded-xl border p-6">Your itinerary is currently unavailable.</div>; }
        if (!itinerary || !userId) notFound();
        return <div className="mx-auto w-full max-w-5xl px-3 py-4 sm:px-4">
            <EditForm key={`${userId}:${itinerary.id}:d1`} itinerary={itinerary} dataCandidate="d1" previewActor={userId} />
        </div>;
    }
    const { userId } = await auth();

    if (!userId) {
        redirect("/sign-in");
    }

    const { id } = await params;

    // Fetch itinerary from database
    const supabase = createSupabaseAdmin();
    const { data: itinerary, error } = await supabase
        .from("itineraries")
        .select("*")
        .eq("id", id)
        .single();

    if (error || !itinerary) {
        redirect("/itineraries");
    }

    // Check ownership
    if (itinerary.clerk_user_id !== userId) {
        redirect("/itineraries");
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-violet-50 via-indigo-50 to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
            <div className="container mx-auto px-4 py-8">
                <EditForm itinerary={itinerary} />
            </div>
        </div>
    );
}
