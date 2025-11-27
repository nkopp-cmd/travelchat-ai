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

// City-specific Unsplash images for visual appeal
const CITY_IMAGES: Record<string, string> = {
    "seoul": "https://images.unsplash.com/photo-1538485399081-7191377e8241?w=200&h=200&fit=crop",
    "tokyo": "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=200&h=200&fit=crop",
    "bangkok": "https://images.unsplash.com/photo-1508009603885-50cf7c579365?w=200&h=200&fit=crop",
    "singapore": "https://images.unsplash.com/photo-1525625293386-3f8f99389edd?w=200&h=200&fit=crop",
    "osaka": "https://images.unsplash.com/photo-1590559899731-a382839e5549?w=200&h=200&fit=crop",
    "kyoto": "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=200&h=200&fit=crop",
    "paris": "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=200&h=200&fit=crop",
    "london": "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=200&h=200&fit=crop",
    "new york": "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=200&h=200&fit=crop",
    "barcelona": "https://images.unsplash.com/photo-1583422409516-2895a77efded?w=200&h=200&fit=crop",
    "rome": "https://images.unsplash.com/photo-1552832230-c0197dd311b5?w=200&h=200&fit=crop",
    "amsterdam": "https://images.unsplash.com/photo-1534351590666-13e3e96b5017?w=200&h=200&fit=crop",
    "hong kong": "https://images.unsplash.com/photo-1536599018102-9f803c140fc1?w=200&h=200&fit=crop",
    "taipei": "https://images.unsplash.com/photo-1470004914212-05527e49370b?w=200&h=200&fit=crop",
    "bali": "https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=200&h=200&fit=crop",
};

// Default fallback image for unknown cities
const DEFAULT_CITY_IMAGE = "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=200&h=200&fit=crop";

function getCityImage(city: string): string {
    const normalizedCity = city.toLowerCase().trim();

    // Check for exact match first
    if (CITY_IMAGES[normalizedCity]) {
        return CITY_IMAGES[normalizedCity];
    }

    // Check for partial match (e.g., "Seoul, South Korea" -> "seoul")
    for (const [key, url] of Object.entries(CITY_IMAGES)) {
        if (normalizedCity.includes(key)) {
            return url;
        }
    }

    return DEFAULT_CITY_IMAGE;
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
        title: it.city,
        image: getCityImage(it.city),
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
