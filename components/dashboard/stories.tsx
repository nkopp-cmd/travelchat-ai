import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Plus } from "lucide-react";
import Link from "next/link";
import { createSupabaseAdmin } from "@/lib/supabase";

interface Story {
    id: string;
    title: string;
    image?: string;
    isAdd?: boolean;
}

async function getStories(): Promise<Story[]> {
    const supabase = createSupabaseAdmin();
    const { data: itineraries } = await supabase
        .from("itineraries")
        .select("id, title, city")
        .order("created_at", { ascending: false })
        .limit(10);

    const realStories = itineraries?.map((it) => ({
        id: it.id,
        title: it.city, // Use city as the story title for better context
        image: "/placeholder-spot.jpg", // TODO: Use a real image from the city/itinerary
    })) || [];

    return [
        { id: "new", title: "New Trip", isAdd: true },
        ...realStories
    ];
}

export async function Stories() {
    const stories = await getStories();

    return (
        <ScrollArea className="w-full whitespace-nowrap pb-4">
            <div className="flex w-max space-x-4 px-4">
                {stories.map((story) => (
                    <Link key={story.id} href={story.isAdd ? "/itineraries/new" : `/itineraries/${story.id}`} className="flex flex-col items-center gap-2 group">
                        <div className={`relative p-[3px] rounded-full ${story.isAdd ? "border-2 border-dashed border-muted-foreground/50" : "bg-gradient-to-tr from-yellow-400 via-orange-500 to-purple-600"}`}>
                            <div className="p-[2px] bg-background rounded-full">
                                <Avatar className="h-16 w-16 border-2 border-background">
                                    {story.isAdd ? (
                                        <AvatarFallback className="bg-accent/50 group-hover:bg-accent transition-colors">
                                            <Plus className="h-6 w-6 text-muted-foreground" />
                                        </AvatarFallback>
                                    ) : (
                                        <AvatarImage src={story.image} alt={story.title} className="object-cover" />
                                    )}
                                    {!story.isAdd && <AvatarFallback>{story.title[0]}</AvatarFallback>}
                                </Avatar>
                            </div>
                        </div>
                        <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                            {story.title}
                        </span>
                    </Link>
                ))}
            </div>
            <ScrollBar orientation="horizontal" className="invisible" />
        </ScrollArea>
    );
}
