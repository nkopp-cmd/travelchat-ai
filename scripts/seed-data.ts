import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
    console.error("Missing Supabase URL or Service Role Key");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function seed() {
    console.log("Seeding data...");

    const spot = {
        name: { en: "The Vinyl Archive" },
        description: { en: "A secret jazz bar hidden behind a vending machine door. Known only to locals and serious audiophiles. The owner has a collection of over 5,000 rare vinyl records." },
        location: "POINT(139.701 35.658)", // WKT format for PostGIS
        address: { en: "2-chōme-14-7 Shibuya, Tokyo 150-0002" },
        category: "Nightlife",
        subcategories: ["Jazz Bar", "Speakeasy", "Vinyl"],
        localley_score: 5, // Hidden Gem
        local_percentage: 85,
        best_times: { en: "9:00 PM - 11:00 PM" },
        photos: ["/placeholder-spot.svg"],
        tips: { en: ["Look for the red vending machine in the alley.", "Order the 'Blue Note' cocktail.", "Quiet conversation only."] },
        verified: true,
        trending_score: 0.95
    };

    const { data, error } = await supabase
        .from("spots")
        .insert(spot)
        .select();

    if (error) {
        console.error("Error inserting spot:", error);
    } else {
        console.log("Inserted spot:", data);
    }
}

seed();
