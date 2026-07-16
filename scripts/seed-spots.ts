import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing Supabase credentials in .env.local');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Sample spots data across multiple cities
const spots = [
    // Seoul, South Korea
    {
        name: { en: "Mangwon Market Street Food Alley", ko: "망원시장 먹자골목" },
        description: { en: "Hidden food alley in Mangwon Market where locals grab authentic Korean street food. No tourists, just pure Seoul vibes.", ko: "망원시장 안 숨겨진 먹자골목. 관광객 없이 순수한 서울 분위기." },
        location: `POINT(126.9024 37.5558)`,
        address: { en: "Mangwon-dong, Mapo-gu, Seoul", ko: "서울 마포구 망원동" },
        category: "Food",
        subcategories: ["Street Food", "Korean", "Market"],
        localley_score: 5,
        local_percentage: 95,
        best_times: { en: "Weekday evenings 6-8 PM", ko: "평일 저녁 6-8시" },
        photos: ["https://images.unsplash.com/photo-1517154421773-0529f29ea451?w=800"],
        tips: { en: ["Cash only", "Try the tteokbokki from the corner stall", "Go hungry - portions are huge"] },
        verified: true,
        trending_score: 0.3
    },
    {
        name: { en: "Seongsu Cafe Street", ko: "성수동 카페거리" },
        description: { en: "Industrial-chic neighborhood turned hipster cafe haven. Former factories now house Seoul's coolest coffee shops.", ko: "공장지대에서 힙스터 카페 천국으로 변신한 동네." },
        location: `POINT(127.0557 37.5443)`,
        address: { en: "Seongsu-dong, Seongdong-gu, Seoul", ko: "서울 성동구 성수동" },
        category: "Cafe",
        subcategories: ["Coffee", "Dessert", "Instagram-worthy"],
        localley_score: 4,
        local_percentage: 70,
        best_times: { en: "Weekend afternoons 2-5 PM", ko: "주말 오후 2-5시" },
        photos: ["https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=800"],
        tips: { en: ["Explore the side alleys", "Most cafes open after 11 AM", "Parking is difficult - take subway"] },
        verified: true,
        trending_score: 0.85
    },
    {
        name: { en: "Ikseon-dong Hanok Village", ko: "익선동 한옥마을" },
        description: { en: "Traditional Korean houses converted into trendy bars and restaurants. Less touristy than Bukchon, more authentic vibes.", ko: "전통 한옥을 개조한 트렌디한 바와 레스토랑. 북촌보다 덜 관광지화됨." },
        location: `POINT(126.9916 37.5714)`,
        address: { en: "Ikseon-dong, Jongno-gu, Seoul", ko: "서울 종로구 익선동" },
        category: "Nightlife",
        subcategories: ["Bars", "Korean Fusion", "Historic"],
        localley_score: 4,
        local_percentage: 65,
        best_times: { en: "Weeknight evenings 7-10 PM", ko: "평일 저녁 7-10시" },
        photos: ["https://images.unsplash.com/photo-1583470790878-4e0a76e0e5c5?w=800"],
        tips: { en: ["Narrow alleys - easy to get lost", "Reservations recommended for dinner", "Cash-friendly"] },
        verified: true,
        trending_score: 0.75
    },
    {
        name: { en: "Gwangjang Market Bindaetteok Alley", ko: "광장시장 빈대떡 골목" },
        description: { en: "The OG Korean pancake spot. Locals have been coming here for 100+ years. Sit at the counter and watch the magic happen.", ko: "100년 넘게 이어온 빈대떡 명소. 카운터에 앉아 요리 과정을 구경하세요." },
        location: `POINT(127.0099 37.5701)`,
        address: { en: "Jongno 4-ga, Jongno-gu, Seoul", ko: "서울 종로구 종로4가" },
        category: "Food",
        subcategories: ["Korean", "Market", "Traditional", "Tourist-heavy"],
        localley_score: 2,
        local_percentage: 30,
        best_times: { en: "Lunch time 12-2 PM", ko: "점심시간 12-2시" },
        photos: ["https://images.unsplash.com/photo-1590301157890-4810ed352733?w=800"],
        tips: { en: ["Order bindaetteok (mung bean pancake)", "Pair with makgeolli (rice wine)", "Cash only, no English menu"] },
        verified: true,
        trending_score: 0.4
    },
    {
        name: { en: "Yeonnam-dong Gyeongui Line Forest", ko: "연남동 경의선숲길" },
        description: { en: "Former railway turned linear park with hidden cafes and boutiques along the path. Local's favorite weekend stroll.", ko: "옛 철길을 공원으로 만든 곳. 숨겨진 카페와 부티크가 즐비." },
        location: `POINT(126.9246 37.5641)`,
        address: { en: "Yeonnam-dong, Mapo-gu, Seoul", ko: "서울 마포구 연남동" },
        category: "Outdoor",
        subcategories: ["Park", "Shopping", "Cafe"],
        localley_score: 5,
        local_percentage: 80,
        best_times: { en: "Spring/Fall afternoons", ko: "봄/가을 오후" },
        photos: ["https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800"],
        tips: { en: ["Rent a bike", "Check out the vintage shops", "Great for photos"] },
        verified: true,
        trending_score: 0.6
    },

    // Tokyo, Japan
    {
        name: { en: "Omoide Yokocho (Memory Lane)", ja: "思い出横丁" },
        description: { en: "Tiny yakitori alleys near Shinjuku Station. Smoky, cramped, and absolutely authentic. Where salarymen unwind after work.", ja: "新宿駅近くの小さな焼き鳥横丁。煙たくて狭いけど本物の雰囲気。" },
        location: `POINT(139.7005 35.6938)`,
        address: { en: "Nishi-Shinjuku, Shinjuku-ku, Tokyo", ja: "東京都新宿区西新宿" },
        category: "Food",
        subcategories: ["Yakitori", "Izakaya", "Japanese"],
        localley_score: 5,
        local_percentage: 85,
        best_times: { en: "Weeknight evenings 7-9 PM", ja: "平日夜7-9時" },
        photos: ["https://images.unsplash.com/photo-1542051841857-5f90071e7989?w=800"],
        tips: { en: ["Very small spaces - not for claustrophobics", "Cash only", "Order the chicken skin skewers"] },
        verified: true,
        trending_score: 0.5
    },
    {
        name: { en: "Shimokitazawa Vintage District", ja: "下北沢古着街" },
        description: { en: "Tokyo's coolest neighborhood for vintage fashion and indie culture. Maze of narrow streets filled with thrift shops and live music venues.", ja: "東京で一番クールな古着とインディーカルチャーの街。" },
        location: `POINT(139.6681 35.6617)`,
        address: { en: "Kitazawa, Setagaya-ku, Tokyo", ja: "東京都世田谷区北沢" },
        category: "Shopping",
        subcategories: ["Vintage", "Fashion", "Music"],
        localley_score: 5,
        local_percentage: 75,
        best_times: { en: "Weekend afternoons", ja: "週末午後" },
        photos: ["https://images.unsplash.com/photo-1528698827591-e19ccd7bc23d?w=800"],
        tips: { en: ["Bargaining is acceptable", "Check out the basement shops", "Live music on weekends"] },
        verified: true,
        trending_score: 0.7
    },
    {
        name: { en: "Tsukiji Outer Market", ja: "築地場外市場" },
        description: { en: "The real deal for fresh sushi and seafood. Skip the tourist traps, eat where the chefs eat.", ja: "本物の寿司と海鮮が食べられる場所。シェフが通う店で食べよう。" },
        location: `POINT(139.7709 35.6654)`,
        address: { en: "Tsukiji, Chuo-ku, Tokyo", ja: "東京都中央区築地" },
        category: "Food",
        subcategories: ["Sushi", "Seafood", "Market"],
        localley_score: 4,
        local_percentage: 60,
        best_times: { en: "Early morning 6-9 AM", ja: "早朝6-9時" },
        photos: ["https://images.unsplash.com/photo-1579584425555-c3ce17fd4351?w=800"],
        tips: { en: ["Go early for best selection", "Cash only at most stalls", "Try the tamago (egg) sushi"] },
        verified: true,
        trending_score: 0.65
    },
    {
        name: { en: "Nakameguro River Walk", ja: "中目黒川沿い" },
        description: { en: "Cherry blossom paradise in spring, trendy cafes year-round. Less crowded than other sakura spots.", ja: "春は桜の名所、年中トレンディなカフェが並ぶ。他の桜スポットより空いている。" },
        location: `POINT(139.6983 35.6436)`,
        address: { en: "Kamimeguro, Meguro-ku, Tokyo", ja: "東京都目黒区上目黒" },
        category: "Outdoor",
        subcategories: ["Cherry Blossoms", "Cafe", "River"],
        localley_score: 4,
        local_percentage: 70,
        best_times: { en: "Cherry blossom season (late March)", ja: "桜の季節（3月下旬）" },
        photos: ["https://images.unsplash.com/photo-1522383225653-ed111181a951?w=800"],
        tips: { en: ["Visit on weekdays to avoid crowds", "Evening illumination during sakura season", "Explore the side streets"] },
        verified: true,
        trending_score: 0.8
    },
    {
        name: { en: "Koenji Awa Odori Festival Street", ja: "高円寺阿波踊り通り" },
        description: { en: "Bohemian neighborhood with vintage shops, punk rock bars, and the best ramen you've never heard of.", ja: "ビンテージショップ、パンクロックバー、知られざる最高のラーメン店がある。" },
        location: `POINT(139.6493 35.7058)`,
        address: { en: "Koenji-kita, Suginami-ku, Tokyo", ja: "東京都杉並区高円寺北" },
        category: "Nightlife",
        subcategories: ["Bars", "Ramen", "Alternative"],
        localley_score: 6,
        local_percentage: 95,
        best_times: { en: "Late night 10 PM-2 AM", ja: "深夜10時-2時" },
        photos: ["https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800"],
        tips: { en: ["Ramen shops open late", "Dive bars with no English signs", "Festival in late August"] },
        verified: true,
        trending_score: 0.35
    },

    // Bangkok, Thailand
    {
        name: { en: "Talad Rot Fai Ratchada", th: "ตลาดนัดรถไฟรัชดา" },
        description: { en: "Night market where Bangkok locals actually shop. Vintage finds, street food, and live music. Skip Chatuchak, come here.", th: "คนกรุงเทพช็อปจริง ของวินเทจ อาหารริมทาง ดนตรีสด" },
        location: `POINT(100.5608 13.7613)`,
        address: { en: "Ratchadaphisek Rd, Din Daeng, Bangkok", th: "ถ.รัชดาภิเษก ดินแดง กรุงเทพฯ" },
        category: "Shopping",
        subcategories: ["Night Market", "Vintage", "Street Food"],
        localley_score: 5,
        local_percentage: 80,
        best_times: { en: "Thursday-Sunday evenings 5-11 PM", th: "พฤ-อา เย็น 17-23น." },
        photos: ["https://images.unsplash.com/photo-1563492065599-3520f775eeed?w=800"],
        tips: { en: ["Take MRT to Thailand Cultural Centre", "Bargain hard", "Try the grilled seafood"] },
        verified: true,
        trending_score: 0.6
    },
    {
        name: { en: "Ari Hipster District", th: "ย่านอารีย์" },
        description: { en: "Bangkok's Brooklyn. Indie cafes, craft beer bars, and the best pad thai you'll ever have. Zero tourists.", th: "บรู๊คลินของกรุงเทพ คาเฟ่อินดี้ บาร์เบียร์คราฟต์ ผัดไทยเด็ด" },
        location: `POINT(100.5411 13.7792)`,
        address: { en: "Phahonyothin Rd, Phaya Thai, Bangkok", th: "ถ.พหลโยธิน พญาไท กรุงเทพฯ" },
        category: "Cafe",
        subcategories: ["Coffee", "Craft Beer", "Thai Food"],
        localley_score: 5,
        local_percentage: 90,
        best_times: { en: "Weekend brunch 10 AM-2 PM", th: "สุดสัปดาห์ บรันช์ 10-14น." },
        photos: ["https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=800"],
        tips: { en: ["Explore the sois (side streets)", "Parking is nightmare - take BTS", "Cash preferred"] },
        verified: true,
        trending_score: 0.75
    },
    {
        name: { en: "Yaowarat (Chinatown) Street Food", th: "เยาวราช" },
        description: { en: "The real Bangkok emerges at night. Neon-lit streets, smoking woks, and food that'll change your life. Bring your appetite.", th: "กรุงเทพที่แท้จริงตอนกลางคืน ถนนไฟนีออน กระทะควัน อาหารเปลี่ยนชีวิต" },
        location: `POINT(100.5093 13.7398)`,
        address: { en: "Yaowarat Rd, Samphanthawong, Bangkok", th: "ถ.เยาวราช สัมพันธวงศ์ กรุงเทพฯ" },
        category: "Food",
        subcategories: ["Street Food", "Chinese-Thai", "Night Market"],
        localley_score: 6,
        local_percentage: 85,
        best_times: { en: "Night time 7-11 PM", th: "กลางคืน 19-23น." },
        photos: ["https://images.unsplash.com/photo-1578474846511-04ba529f0b88?w=800"],
        tips: { en: ["Wear comfortable shoes", "Try the crab omelet", "Cash only, small bills"] },
        verified: true,
        trending_score: 0.45
    },
    {
        name: { en: "Thonglor Soi 11 Bar Alley", th: "ซอยทองหล่อ 11" },
        description: { en: "Where Bangkok's cool kids drink. Speakeasies, rooftop bars, and craft cocktails. Dress code: effortlessly cool.", th: "ที่คนเท่กรุงเทพดื่ม บาร์ลับ รูฟท็อป ค็อกเทลคราฟต์" },
        location: `POINT(100.5725 13.7364)`,
        address: { en: "Thonglor Soi 11, Watthana, Bangkok", th: "ทองหล่อ ซอย 11 วัฒนา กรุงเทพฯ" },
        category: "Nightlife",
        subcategories: ["Bars", "Cocktails", "Rooftop"],
        localley_score: 4,
        local_percentage: 70,
        best_times: { en: "Friday-Saturday nights 9 PM-1 AM", th: "ศุกร์-เสาร์ คืน 21-01น." },
        photos: ["https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=800"],
        tips: { en: ["Reservations recommended", "Dress smart-casual", "Expensive but worth it"] },
        verified: true,
        trending_score: 0.8
    },
    {
        name: { en: "Khlong Lat Mayom Floating Market", th: "ตลาดน้ำคลองลัดมะยม" },
        description: { en: "The floating market locals actually use. No elephant pants, just fresh produce and grandma's recipes.", th: "ตลาดน้ำที่คนท้องถิ่นใช้จริง ไม่มีกางเกงช้าง แค่ผักสดและสูตรยาย" },
        location: `POINT(100.4125 13.7833)`,
        address: { en: "Bang Ramat, Taling Chan, Bangkok", th: "บางระมาด ตลิ่งชัน กรุงเทพฯ" },
        category: "Market",
        subcategories: ["Floating Market", "Thai Food", "Traditional"],
        localley_score: 6,
        local_percentage: 95,
        best_times: { en: "Saturday-Sunday mornings 8-11 AM", th: "เสาร์-อา เช้า 8-11น." },
        photos: ["https://images.unsplash.com/photo-1552465011-b4e21bf6e79a?w=800"],
        tips: { en: ["Take a boat tour", "Try the boat noodles", "Wear sunscreen"] },
        verified: true,
        trending_score: 0.3
    },

    // Singapore
    {
        name: { en: "Tiong Bahru Estate", zh: "中峇鲁" },
        description: { en: "Singapore's hippest hood. Art Deco architecture meets indie bookstores and artisanal bakeries. Where cool Singaporeans brunch.", zh: "新加坡最潮的社区。装饰艺术建筑遇上独立书店和手工面包店。" },
        location: `POINT(103.8270 1.2862)`,
        address: { en: "Tiong Bahru, Singapore", zh: "中峇鲁，新加坡" },
        category: "Cafe",
        subcategories: ["Coffee", "Bakery", "Books"],
        localley_score: 5,
        local_percentage: 75,
        best_times: { en: "Weekend mornings 9-12 PM", zh: "周末早上9-12点" },
        photos: ["https://images.unsplash.com/photo-1525610553991-2bede1a236e2?w=800"],
        tips: { en: ["Visit the wet market first", "Books Actually is a must-visit", "Try the kaya toast"] },
        verified: true,
        trending_score: 0.7
    },
    {
        name: { en: "Jalan Besar Hipster Enclave", zh: "惹兰勿刹" },
        description: { en: "Old-school shophouses turned trendy cafes and bars. Singapore's answer to gentrification done right.", zh: "老店屋变身时尚咖啡馆和酒吧。新加坡的绅士化典范。" },
        location: `POINT(103.8565 1.3058)`,
        address: { en: "Jalan Besar, Singapore", zh: "惹兰勿刹，新加坡" },
        category: "Nightlife",
        subcategories: ["Bars", "Cafe", "Heritage"],
        localley_score: 5,
        local_percentage: 80,
        best_times: { en: "Weeknight evenings 6-10 PM", zh: "平日晚上6-10点" },
        photos: ["https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?w=800"],
        tips: { en: ["Explore the side lanes", "Mix of old and new", "Great for photos"] },
        verified: true,
        trending_score: 0.65
    },
    {
        name: { en: "Tekka Centre Hawker", zh: "竹脚中心" },
        description: { en: "Little India's food court. Authentic Indian cuisine at hawker prices. Where the Indian community eats.", zh: "小印度的美食中心。正宗印度菜，小贩价格。印度社区吃饭的地方。" },
        location: `POINT(103.8517 1.3063)`,
        address: { en: "Serangoon Rd, Little India, Singapore", zh: "实龙岗路，小印度，新加坡" },
        category: "Food",
        subcategories: ["Indian", "Hawker", "Halal"],
        localley_score: 6,
        local_percentage: 90,
        best_times: { en: "Lunch time 12-2 PM", zh: "午餐时间12-2点" },
        photos: ["https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=800"],
        tips: { en: ["Try the biryani", "Cash only", "Go hungry"] },
        verified: true,
        trending_score: 0.4
    },
    {
        name: { en: "Haji Lane", zh: "哈芝巷" },
        description: { en: "Narrow street packed with boutiques, street art, and Middle Eastern cafes. Instagram heaven, but still authentic.", zh: "狭窄街道挤满精品店、街头艺术和中东咖啡馆。Instagram天堂，但仍然真实。" },
        location: `POINT(103.8589 1.3008)`,
        address: { en: "Haji Lane, Kampong Glam, Singapore", zh: "哈芝巷，甘榜格南，新加坡" },
        category: "Shopping",
        subcategories: ["Boutique", "Street Art", "Cafe"],
        localley_score: 3,
        local_percentage: 50,
        best_times: { en: "Afternoon 2-6 PM", zh: "下午2-6点" },
        photos: ["https://images.unsplash.com/photo-1565967511849-76a60a516170?w=800"],
        tips: { en: ["Weekdays less crowded", "Explore Arab Street nearby", "Bring camera"] },
        verified: true,
        trending_score: 0.9
    },
    {
        name: { en: "East Coast Lagoon Food Village", zh: "东海岸泻湖美食村" },
        description: { en: "Beachside hawker centre where Singaporeans go for weekend seafood feasts. Sunset views included.", zh: "海滨小贩中心，新加坡人周末海鲜盛宴的地方。包括日落美景。" },
        location: `POINT(103.9295 1.3008)`,
        address: { en: "East Coast Park, Singapore", zh: "东海岸公园，新加坡" },
        category: "Food",
        subcategories: ["Seafood", "Hawker", "Beachside"],
        localley_score: 5,
        local_percentage: 85,
        best_times: { en: "Weekend evenings 5-8 PM", zh: "周末晚上5-8点" },
        photos: ["https://images.unsplash.com/photo-1559339352-11d035aa65de?w=800"],
        tips: { en: ["Try the BBQ stingray", "Bring mosquito repellent", "Parking fills up fast"] },
        verified: true,
        trending_score: 0.5
    }
];

async function seedSpots() {
    console.log('🌱 Starting to seed spots...');

    for (const spot of spots) {
        try {
            const { data, error } = await supabase
                .from('spots')
                .insert([spot])
                .select();

            if (error) {
                console.error(`❌ Error inserting ${spot.name.en}:`, error.message);
            } else {
                console.log(`✅ Inserted: ${spot.name.en}`);
            }
        } catch (err) {
            console.error(`❌ Exception inserting ${spot.name.en}:`, err);
        }
    }

    console.log('\n🎉 Seeding complete!');
    console.log(`📊 Total spots attempted: ${spots.length}`);
}

// Run the seed function
seedSpots()
    .then(() => {
        console.log('\n✨ All done! Check your Supabase dashboard.');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n💥 Fatal error:', error);
        process.exit(1);
    });
