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

// Additional 30 spots to expand our database
const additionalSpots = [
    // Seoul, South Korea (7 more spots)
    {
        name: { en: "Bukchon Hanok Village", ko: "북촌한옥마을" },
        description: { en: "Traditional Korean houses in the heart of Seoul. Less touristy in early mornings, stunning architecture and quiet alleyways.", ko: "서울 중심부의 전통 한옥. 이른 아침에는 관광객이 적고 조용함." },
        location: `POINT(126.9850 37.5825)`,
        address: { en: "Gahoe-dong, Jongno-gu, Seoul", ko: "서울 종로구 가회동" },
        category: "Outdoor",
        subcategories: ["Historic", "Architecture", "Walking"],
        localley_score: 3,
        local_percentage: 40,
        best_times: { en: "Early morning 6-8 AM", ko: "이른 아침 6-8시" },
        photos: ["https://images.unsplash.com/photo-1517154421773-0529f29ea451?w=800"],
        tips: { en: ["Visit early to avoid crowds", "Respect residents' privacy", "Combine with nearby museums"] },
        verified: true,
        trending_score: 0.6
    },
    {
        name: { en: "Hongdae Playground Street", ko: "홍대 놀이터거리" },
        description: { en: "Street performances, indie music, and young energy. Where Seoul's creative youth gather. Best on weekend evenings.", ko: "거리 공연, 인디 음악, 젊은 에너지. 서울의 창의적인 젊은이들이 모이는 곳." },
        location: `POINT(126.9227 37.5563)`,
        address: { en: "Hongdae, Mapo-gu, Seoul", ko: "서울 마포구 홍대" },
        category: "Nightlife",
        subcategories: ["Music", "Street Performance", "Youth Culture"],
        localley_score: 4,
        local_percentage: 65,
        best_times: { en: "Friday-Saturday evenings 7-11 PM", ko: "금-토 저녁 7-11시" },
        photos: ["https://images.unsplash.com/photo-1542051841857-5f90071e7989?w=800"],
        tips: { en: ["Cash for street food", "Check out the indie clubs", "Busking starts around 7 PM"] },
        verified: true,
        trending_score: 0.75
    },
    {
        name: { en: "Namdaemun Market", ko: "남대문시장" },
        description: { en: "Korea's oldest and largest market. Wholesale prices, authentic street food, and zero English. Pure Seoul chaos in the best way.", ko: "한국에서 가장 오래되고 큰 시장. 도매가격, 진짜 길거리 음식." },
        location: `POINT(126.9776 37.5595)`,
        address: { en: "Namdaemun-ro, Jung-gu, Seoul", ko: "서울 중구 남대문로" },
        category: "Market",
        subcategories: ["Shopping", "Street Food", "Wholesale"],
        localley_score: 5,
        local_percentage: 85,
        best_times: { en: "Early morning 5-9 AM", ko: "이른 아침 5-9시" },
        photos: ["https://images.unsplash.com/photo-1590301157890-4810ed352733?w=800"],
        tips: { en: ["Bargain hard", "Try the kalguksu (knife-cut noodles)", "Some shops close by afternoon"] },
        verified: true,
        trending_score: 0.4
    },
    {
        name: { en: "Garosu-gil", ko: "가로수길" },
        description: { en: "Tree-lined street with boutique shops and trendy cafes. Seoul's fashion district with a European vibe.", ko: "가로수가 늘어선 거리에 부티크 샵과 트렌디한 카페. 유럽 느낌." },
        location: `POINT(127.0226 37.5194)`,
        address: { en: "Sinsa-dong, Gangnam-gu, Seoul", ko: "서울 강남구 신사동" },
        category: "Shopping",
        subcategories: ["Fashion", "Cafe", "Boutique"],
        localley_score: 3,
        local_percentage: 55,
        best_times: { en: "Weekday afternoons 2-6 PM", ko: "평일 오후 2-6시" },
        photos: ["https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=800"],
        tips: { en: ["Explore the side alleys", "Expensive but quality", "Great for people watching"] },
        verified: true,
        trending_score: 0.7
    },
    {
        name: { en: "Noryangjin Fish Market", ko: "노량진수산시장" },
        description: { en: "24-hour fish market where you can buy fresh seafood and have it prepared upstairs. Raw, real, and unforgettable.", ko: "24시간 수산시장. 신선한 해산물을 사서 위층에서 바로 먹을 수 있음." },
        location: `POINT(126.9423 37.5133)`,
        address: { en: "Noryangjin-dong, Dongjak-gu, Seoul", ko: "서울 동작구 노량진동" },
        category: "Food",
        subcategories: ["Seafood", "Market", "24-Hour"],
        localley_score: 6,
        local_percentage: 95,
        best_times: { en: "Late night 10 PM-2 AM or early morning", ko: "늦은 밤 10시-새벽 2시 또는 이른 아침" },
        photos: ["https://images.unsplash.com/photo-1579584425555-c3ce17fd4351?w=800"],
        tips: { en: ["Bargain expected", "Bring cash", "Try the live octopus"] },
        verified: true,
        trending_score: 0.35
    },
    {
        name: { en: "Samcheong-dong Cafe Street", ko: "삼청동 카페거리" },
        description: { en: "Charming neighborhood with traditional hanoks converted into art galleries and cafes. Quieter alternative to Insadong.", ko: "전통 한옥을 개조한 미술관과 카페. 인사동보다 조용한 대안." },
        location: `POINT(126.9825 37.5825)`,
        address: { en: "Samcheong-dong, Jongno-gu, Seoul", ko: "서울 종로구 삼청동" },
        category: "Cafe",
        subcategories: ["Art", "Traditional", "Coffee"],
        localley_score: 4,
        local_percentage: 70,
        best_times: { en: "Weekday afternoons", ko: "평일 오후" },
        photos: ["https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=800"],
        tips: { en: ["Visit the galleries", "Uphill walk from Gyeongbokgung", "Expensive but atmospheric"] },
        verified: true,
        trending_score: 0.65
    },
    {
        name: { en: "Dongdaemun Design Plaza (DDP) Night Market", ko: "동대문디자인플라자 야시장" },
        description: { en: "Futuristic architecture meets night market. Fashion, food, and late-night shopping until dawn.", ko: "미래적인 건축물과 야시장. 패션, 음식, 새벽까지 쇼핑." },
        location: `POINT(127.0096 37.5665)`,
        address: { en: "Euljiro, Jung-gu, Seoul", ko: "서울 중구 을지로" },
        category: "Shopping",
        subcategories: ["Fashion", "Night Market", "Design"],
        localley_score: 3,
        local_percentage: 50,
        best_times: { en: "Late night 10 PM-4 AM", ko: "늦은 밤 10시-새벽 4시" },
        photos: ["https://images.unsplash.com/photo-1528698827591-e19ccd7bc23d?w=800"],
        tips: { en: ["Wholesale prices after midnight", "Bring cash", "Nearby Dongdaemun market is bigger"] },
        verified: true,
        trending_score: 0.8
    },

    // Tokyo, Japan (8 more spots)
    {
        name: { en: "Yanaka Ginza Shopping Street", ja: "谷中銀座商店街" },
        description: { en: "Old Tokyo vibes with traditional shops and street food. Survived WWII bombings, pure nostalgia.", ja: "昔の東京の雰囲気。戦争を生き延びた商店街。" },
        location: `POINT(139.7653 35.7275)`,
        address: { en: "Yanaka, Taito-ku, Tokyo", ja: "東京都台東区谷中" },
        category: "Shopping",
        subcategories: ["Traditional", "Street Food", "Historic"],
        localley_score: 5,
        local_percentage: 80,
        best_times: { en: "Afternoon 2-5 PM", ja: "午後2-5時" },
        photos: ["https://images.unsplash.com/photo-1528698827591-e19ccd7bc23d?w=800"],
        tips: { en: ["Try the menchi-katsu", "Visit nearby Yanaka Cemetery", "Closed Mondays"] },
        verified: true,
        trending_score: 0.55
    },
    {
        name: { en: "Daikanyama T-Site", ja: "代官山蔦屋書店" },
        description: { en: "Most beautiful bookstore in Tokyo. Design books, vinyl records, and a Starbucks that doesn't feel corporate.", ja: "東京で一番美しい本屋。デザイン本、レコード、おしゃれなスタバ。" },
        location: `POINT(139.7009 35.6499)`,
        address: { en: "Sarugaku-cho, Shibuya-ku, Tokyo", ja: "東京都渋谷区猿楽町" },
        category: "Shopping",
        subcategories: ["Books", "Design", "Cafe"],
        localley_score: 4,
        local_percentage: 65,
        best_times: { en: "Weekday mornings", ja: "平日午前" },
        photos: ["https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=800"],
        tips: { en: ["English books available", "Lounge area on 2nd floor", "Pet-friendly"] },
        verified: true,
        trending_score: 0.7
    },
    {
        name: { en: "Kagurazaka French Quarter", ja: "神楽坂フレンチ街" },
        description: { en: "Tokyo's Little Paris with cobblestone streets, French bistros, and geisha houses. Romantic and unexpected.", ja: "東京の小さなパリ。石畳、フレンチビストロ、芸者の家。" },
        location: `POINT(139.7386 35.7025)`,
        address: { en: "Kagurazaka, Shinjuku-ku, Tokyo", ja: "東京都新宿区神楽坂" },
        category: "Food",
        subcategories: ["French", "Romantic", "Historic"],
        localley_score: 5,
        local_percentage: 75,
        best_times: { en: "Evening 6-9 PM", ja: "夕方6-9時" },
        photos: ["https://images.unsplash.com/photo-1517154421773-0529f29ea451?w=800"],
        tips: { en: ["Reservations essential", "Explore the side alleys", "Expensive but worth it"] },
        verified: true,
        trending_score: 0.6
    },
    {
        name: { en: "Ameya-Yokocho Market", ja: "アメヤ横丁" },
        description: { en: "Post-war black market turned bustling bazaar. Cheap everything, loud vendors, pure Tokyo energy.", ja: "戦後の闇市が賑やかな市場に。安い、うるさい、東京のエネルギー。" },
        location: `POINT(139.7745 35.7125)`,
        address: { en: "Ueno, Taito-ku, Tokyo", ja: "東京都台東区上野" },
        category: "Market",
        subcategories: ["Shopping", "Street Food", "Historic"],
        localley_score: 5,
        local_percentage: 85,
        best_times: { en: "Afternoon 1-4 PM", ja: "午後1-4時" },
        photos: ["https://images.unsplash.com/photo-1590301157890-4810ed352733?w=800"],
        tips: { en: ["Bargain expected", "Try the kebabs", "Cash only"] },
        verified: true,
        trending_score: 0.45
    },
    {
        name: { en: "Harmonica Yokocho", ja: "ハモニカ横丁" },
        description: { en: "Tiny alley of even tinier bars near Kichijoji. Squeeze in, drink cheap, make friends with salarymen.", ja: "吉祥寺近くの小さなバーが並ぶ路地。狭い、安い、サラリーマンと友達に。" },
        location: `POINT(139.5794 35.7033)`,
        address: { en: "Kichijoji, Musashino, Tokyo", ja: "東京都武蔵野市吉祥寺" },
        category: "Nightlife",
        subcategories: ["Bars", "Izakaya", "Local"],
        localley_score: 6,
        local_percentage: 90,
        best_times: { en: "Late evening 8-11 PM", ja: "夜8-11時" },
        photos: ["https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=800"],
        tips: { en: ["Cash only", "Most bars seat 6-8 people", "Order the yakitori"] },
        verified: true,
        trending_score: 0.4
    },
    {
        name: { en: "Yanesen Area", ja: "谷根千エリア" },
        description: { en: "Yanaka, Nezu, Sendagi combined. Old Tokyo preserved with temples, traditional shops, and cats everywhere.", ja: "谷中、根津、千駄木。古い東京が保存されている。寺、伝統的な店、猫。" },
        location: `POINT(139.7653 35.7275)`,
        address: { en: "Yanaka/Nezu/Sendagi, Taito-ku, Tokyo", ja: "東京都台東区谷中・根津・千駄木" },
        category: "Outdoor",
        subcategories: ["Historic", "Walking", "Traditional"],
        localley_score: 5,
        local_percentage: 80,
        best_times: { en: "Weekend mornings", ja: "週末午前" },
        photos: ["https://images.unsplash.com/photo-1522383225653-ed111181a951?w=800"],
        tips: { en: ["Wear comfortable shoes", "Visit the cat cafes", "Bring a camera"] },
        verified: true,
        trending_score: 0.5
    },
    {
        name: { en: "Daikoku-yu Sento", ja: "大黒湯" },
        description: { en: "Traditional public bathhouse with Mount Fuji mural. Experience real Tokyo bathing culture.", ja: "富士山の壁画がある伝統的な銭湯。本物の東京の入浴文化。" },
        location: `POINT(139.7009 35.6499)`,
        address: { en: "Meguro, Tokyo", ja: "東京都目黒区" },
        category: "Outdoor",
        subcategories: ["Traditional", "Wellness", "Cultural"],
        localley_score: 6,
        local_percentage: 95,
        best_times: { en: "Evening 6-9 PM", ja: "夕方6-9時" },
        photos: ["https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800"],
        tips: { en: ["Bring your own towel", "No tattoos allowed", "¥500 entry"] },
        verified: true,
        trending_score: 0.3
    },
    {
        name: { en: "Kappabashi Kitchen Town", ja: "かっぱ橋道具街" },
        description: { en: "Where Tokyo chefs buy their tools. Knives, ceramics, and those plastic food displays. Unique shopping.", ja: "東京のシェフが道具を買う場所。包丁、陶器、食品サンプル。" },
        location: `POINT(139.7889 35.7125)`,
        address: { en: "Matsugaya, Taito-ku, Tokyo", ja: "東京都台東区松が谷" },
        category: "Shopping",
        subcategories: ["Kitchen", "Professional", "Unique"],
        localley_score: 5,
        local_percentage: 75,
        best_times: { en: "Weekday afternoons", ja: "平日午後" },
        photos: ["https://images.unsplash.com/photo-1528698827591-e19ccd7bc23d?w=800"],
        tips: { en: ["Tax-free shopping available", "Bring measurements", "Most shops close Sundays"] },
        verified: true,
        trending_score: 0.55
    },

    // Bangkok, Thailand (8 more spots)
    {
        name: { en: "Chatuchak Weekend Market", th: "ตลาดนัดจตุจักร" },
        description: { en: "World's largest weekend market. 15,000 stalls, everything imaginable. Get lost, find treasures, repeat.", th: "ตลาดนัดที่ใหญ่ที่สุดในโลก 15,000 ร้าน ทุกอย่างที่คิดได้" },
        location: `POINT(100.5499 13.7990)`,
        address: { en: "Chatuchak, Bangkok", th: "จตุจักร กรุงเทพฯ" },
        category: "Market",
        subcategories: ["Shopping", "Vintage", "Food"],
        localley_score: 3,
        local_percentage: 60,
        best_times: { en: "Saturday-Sunday mornings 9 AM-12 PM", th: "เสาร์-อา เช้า 9-12น." },
        photos: ["https://images.unsplash.com/photo-1563492065599-3520f775eeed?w=800"],
        tips: { en: ["Wear comfortable shoes", "Bring cash", "Go early to beat heat"] },
        verified: true,
        trending_score: 0.85
    },
    {
        name: { en: "Pak Khlong Talat Flower Market", th: "ตลาดปากคลองตลาด" },
        description: { en: "24-hour flower market. Best at 2-4 AM when fresh flowers arrive. Surreal and beautiful.", th: "ตลาดดอกไม้ 24 ชั่วโมง ดีที่สุดตอนตี 2-4 เมื่อดอกไม้สดมาถึง" },
        location: `POINT(100.4928 13.7439)`,
        address: { en: "Chakkrawat, Bangkok", th: "จักรวรรดิ กรุงเทพฯ" },
        category: "Market",
        subcategories: ["Flowers", "24-Hour", "Photography"],
        localley_score: 5,
        local_percentage: 85,
        best_times: { en: "Late night 2-4 AM", th: "ดึก 2-4น." },
        photos: ["https://images.unsplash.com/photo-1552465011-b4e21bf6e79a?w=800"],
        tips: { en: ["Bring camera", "Watch for trucks", "Nearby temples beautiful at dawn"] },
        verified: true,
        trending_score: 0.5
    },
    {
        name: { en: "Soi Nana (Chinatown)", th: "ซอยนานา เยาวราช" },
        description: { en: "Hidden alley in Chinatown with the best street food. Locals only, no tourists, pure Bangkok.", th: "ซอยลับในไชน่าทาวน์ อาหารริมทางที่ดีที่สุด คนท้องถิ่นเท่านั้น" },
        location: `POINT(100.5093 13.7398)`,
        address: { en: "Yaowarat, Bangkok", th: "เยาวราช กรุงเทพฯ" },
        category: "Food",
        subcategories: ["Street Food", "Chinese-Thai", "Hidden"],
        localley_score: 6,
        local_percentage: 95,
        best_times: { en: "Dinner time 6-9 PM", th: "เย็น 6-9น." },
        photos: ["https://images.unsplash.com/photo-1578474846511-04ba529f0b88?w=800"],
        tips: { en: ["Cash only", "Point and order", "Try the crab curry"] },
        verified: true,
        trending_score: 0.3
    },
    {
        name: { en: "Warehouse 30", th: "แวร์เฮ้าส์ 30" },
        description: { en: "Converted warehouse with indie shops, cafes, and art spaces. Bangkok's creative hub.", th: "โกดังเก่าดัดแปลงเป็นร้านอินดี้ คาเฟ่ พื้นที่ศิลปะ" },
        location: `POINT(100.5293 13.7307)`,
        address: { en: "Charoen Krung, Bangkok", th: "เจริญกรุง กรุงเทพฯ" },
        category: "Shopping",
        subcategories: ["Art", "Indie", "Cafe"],
        localley_score: 4,
        local_percentage: 70,
        best_times: { en: "Weekend afternoons", th: "สุดสัปดาห์ บ่าย" },
        photos: ["https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=800"],
        tips: { en: ["Check event schedule", "Parking difficult", "Combine with Chinatown visit"] },
        verified: true,
        trending_score: 0.75
    },
    {
        name: { en: "Saphan Phut Night Market", th: "ตลาดนัดสะพานพุทธ" },
        description: { en: "Cheap fashion and street food by the river. Where Bangkok teens shop. Chaotic and fun.", th: "แฟชั่นราคาถูกและอาหารริมแม่น้ำ วัยรุ่นกรุงเทพช็อป" },
        location: `POINT(100.5028 13.7439)`,
        address: { en: "Phra Nakhon, Bangkok", th: "พระนคร กรุงเทพฯ" },
        category: "Market",
        subcategories: ["Fashion", "Night Market", "Youth"],
        localley_score: 5,
        local_percentage: 80,
        best_times: { en: "Evening 6-10 PM", th: "เย็น 6-10น." },
        photos: ["https://images.unsplash.com/photo-1563492065599-3520f775eeed?w=800"],
        tips: { en: ["Bargain hard", "Cash only", "Watch for pickpockets"] },
        verified: true,
        trending_score: 0.6
    },
    {
        name: { en: "Phra Athit Road", th: "ถนนพระอาทิตย์" },
        description: { en: "Backpacker street turned hipster haven. Cheap beer, live music, and Chao Phraya river views.", th: "ถนนแบ็คแพ็คเกอร์กลายเป็นสวรรค์ฮิปสเตอร์ เบียร์ถูก ดนตรีสด" },
        location: `POINT(100.4978 13.7589)`,
        address: { en: "Phra Nakhon, Bangkok", th: "พระนคร กรุงเทพฯ" },
        category: "Nightlife",
        subcategories: ["Bars", "Live Music", "River"],
        localley_score: 4,
        local_percentage: 65,
        best_times: { en: "Evening 7-11 PM", th: "เย็น 7-11น." },
        photos: ["https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=800"],
        tips: { en: ["Try the street food", "River ferry nearby", "Cheap drinks"] },
        verified: true,
        trending_score: 0.7
    },
    {
        name: { en: "Or Tor Kor Market", th: "ตลาดอ.ต.ก." },
        description: { en: "Bangkok's best fresh market. Premium quality, clean, air-conditioned. Where locals buy the good stuff.", th: "ตลาดสดที่ดีที่สุดในกรุงเทพ คุณภาพพรีเมียม สะอาด แอร์" },
        location: `POINT(100.5548 13.8019)`,
        address: { en: "Chatuchak, Bangkok", th: "จตุจักร กรุงเทพฯ" },
        category: "Market",
        subcategories: ["Food", "Fresh Produce", "Premium"],
        localley_score: 5,
        local_percentage: 90,
        best_times: { en: "Morning 8-11 AM", th: "เช้า 8-11น." },
        photos: ["https://images.unsplash.com/photo-1552465011-b4e21bf6e79a?w=800"],
        tips: { en: ["Try the mango sticky rice", "Expensive but quality", "Food court upstairs"] },
        verified: true,
        trending_score: 0.55
    },
    {
        name: { en: "Soi Rambuttri", th: "ซอยรามบุตรี" },
        description: { en: "Quieter alternative to Khao San Road. Same vibe, fewer tourists, better prices.", th: "ทางเลือกที่เงียบกว่าข้าวสาร บรรยากาศเดียวกัน นักท่องเที่ยวน้อยกว่า" },
        location: `POINT(100.4978 13.7589)`,
        address: { en: "Phra Nakhon, Bangkok", th: "พระนคร กรุงเทพฯ" },
        category: "Nightlife",
        subcategories: ["Bars", "Backpacker", "Budget"],
        localley_score: 4,
        local_percentage: 60,
        best_times: { en: "Evening 7-12 PM", th: "เย็น 7-12น." },
        photos: ["https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=800"],
        tips: { en: ["Cheaper than Khao San", "Good street food", "Quieter atmosphere"] },
        verified: true,
        trending_score: 0.5
    },

    // Singapore (7 more spots)
    {
        name: { en: "Katong/Joo Chiat", zh: "加东/如切" },
        description: { en: "Peranakan heritage district with colorful shophouses, laksa, and old-school charm. Real Singapore.", zh: "娘惹文化区，彩色店屋，叻沙，老派魅力。真正的新加坡。" },
        location: `POINT(103.9040 1.3048)`,
        address: { en: "Katong, Singapore", zh: "加东，新加坡" },
        category: "Food",
        subcategories: ["Peranakan", "Heritage", "Laksa"],
        localley_score: 5,
        local_percentage: 80,
        best_times: { en: "Lunch time 11 AM-2 PM", zh: "午餐时间11-14点" },
        photos: ["https://images.unsplash.com/photo-1559339352-11d035aa65de?w=800"],
        tips: { en: ["Try 328 Katong Laksa", "Walk the heritage trail", "Colorful photo ops"] },
        verified: true,
        trending_score: 0.6
    },
    {
        name: { en: "Everton Park HDB Food Centre", zh: "厄文顿公园组屋熟食中心" },
        description: { en: "Local hawker centre where Singaporeans actually eat. No tourists, just good food and real prices.", zh: "本地人真正吃饭的小贩中心。没有游客，只有好食物和真实价格。" },
        location: `POINT(103.8395 1.2761)`,
        address: { en: "Everton Park, Singapore", zh: "厄文顿公园，新加坡" },
        category: "Food",
        subcategories: ["Hawker", "Local", "Budget"],
        localley_score: 6,
        local_percentage: 95,
        best_times: { en: "Breakfast 7-10 AM", zh: "早餐7-10点" },
        photos: ["https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=800"],
        tips: { en: ["Try the char kway teow", "Cash only", "Go early"] },
        verified: true,
        trending_score: 0.3
    },
    {
        name: { en: "Kampong Glam", zh: "甘榜格南" },
        description: { en: "Malay-Arab quarter with Sultan Mosque, street art, and Middle Eastern cafes. Cultural melting pot.", zh: "马来-阿拉伯区，苏丹清真寺，街头艺术，中东咖啡馆。" },
        location: `POINT(103.8589 1.3008)`,
        address: { en: "Kampong Glam, Singapore", zh: "甘榜格南，新加坡" },
        category: "Outdoor",
        subcategories: ["Heritage", "Street Art", "Cultural"],
        localley_score: 4,
        local_percentage: 65,
        best_times: { en: "Afternoon 2-6 PM", zh: "下午2-6点" },
        photos: ["https://images.unsplash.com/photo-1565967511849-76a60a516170?w=800"],
        tips: { en: ["Visit Sultan Mosque", "Try the Turkish food", "Haji Lane nearby"] },
        verified: true,
        trending_score: 0.75
    },
    {
        name: { en: "Geylang Serai Market", zh: "芽笼士乃市场" },
        description: { en: "Malay wet market and food centre. Authentic, bustling, and delicious. Where locals shop.", zh: "马来湿巴刹和熟食中心。真实，热闹，美味。本地人购物的地方。" },
        location: `POINT(103.8989 1.3158)`,
        address: { en: "Geylang Serai, Singapore", zh: "芽笼士乃，新加坡" },
        category: "Market",
        subcategories: ["Wet Market", "Malay", "Food"],
        localley_score: 5,
        local_percentage: 90,
        best_times: { en: "Morning 7-11 AM", zh: "早上7-11点" },
        photos: ["https://images.unsplash.com/photo-1552465011-b4e21bf6e79a?w=800"],
        tips: { en: ["Try the nasi padang", "Cash preferred", "Ramadan special during fasting month"] },
        verified: true,
        trending_score: 0.45
    },
    {
        name: { en: "Holland Village", zh: "荷兰村" },
        description: { en: "Expat enclave turned trendy dining spot. Mix of old-school and new cafes, bars, and restaurants.", zh: "外籍人士聚集地变身时尚餐饮区。老派和新潮咖啡馆、酒吧、餐厅混合。" },
        location: `POINT(103.7956 1.3111)`,
        address: { en: "Holland Village, Singapore", zh: "荷兰村，新加坡" },
        category: "Nightlife",
        subcategories: ["Bars", "Dining", "Expat"],
        localley_score: 3,
        local_percentage: 50,
        best_times: { en: "Evening 6-10 PM", zh: "晚上6-10点" },
        photos: ["https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=800"],
        tips: { en: ["Try the hawker centre", "Parking difficult", "Good for brunch"] },
        verified: true,
        trending_score: 0.65
    },
    {
        name: { en: "Pulau Ubin", zh: "乌敏岛" },
        description: { en: "Island escape from modern Singapore. Cycling, mangroves, and 1960s kampong vibes. Time travel.", zh: "从现代新加坡逃离的岛屿。骑自行车，红树林，1960年代甘榜氛围。" },
        location: `POINT(103.9608 1.4044)`,
        address: { en: "Pulau Ubin, Singapore", zh: "乌敏岛，新加坡" },
        category: "Outdoor",
        subcategories: ["Nature", "Cycling", "Island"],
        localley_score: 5,
        local_percentage: 75,
        best_times: { en: "Weekend mornings", zh: "周末早上" },
        photos: ["https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800"],
        tips: { en: ["Take bumboat from Changi", "Rent a bike", "Bring water and snacks"] },
        verified: true,
        trending_score: 0.5
    },
    {
        name: { en: "Chinatown Complex Food Centre", zh: "牛车水大厦熟食中心" },
        description: { en: "Legendary hawker centre with Michelin-starred stalls. Cheap, delicious, and always packed.", zh: "传奇小贩中心，有米其林星级摊位。便宜，美味，总是挤满人。" },
        location: `POINT(103.8438 1.2825)`,
        address: { en: "Chinatown, Singapore", zh: "牛车水，新加坡" },
        category: "Food",
        subcategories: ["Hawker", "Michelin", "Chinese"],
        localley_score: 4,
        local_percentage: 70,
        best_times: { en: "Lunch time 11 AM-2 PM", zh: "午餐时间11-14点" },
        photos: ["https://images.unsplash.com/photo-1585937421612-70a008356fbe?w=800"],
        tips: { en: ["Try Liao Fan Hawker Chan", "Go early to avoid queues", "Cash only"] },
        verified: true,
        trending_score: 0.8
    }
];

async function seedAdditionalSpots() {
    console.log('🌱 Starting to seed additional spots...');
    console.log(`📊 Adding ${additionalSpots.length} more spots to the database\n`);

    let successCount = 0;
    let errorCount = 0;

    for (const spot of additionalSpots) {
        try {
            const { data, error } = await supabase
                .from('spots')
                .insert([spot])
                .select();

            if (error) {
                console.error(`❌ Error inserting ${spot.name.en}:`, error.message);
                errorCount++;
            } else {
                console.log(`✅ Inserted: ${spot.name.en}`);
                successCount++;
            }
        } catch (err) {
            console.error(`❌ Exception inserting ${spot.name.en}:`, err);
            errorCount++;
        }
    }

    console.log('\n🎉 Seeding complete!');
    console.log(`📊 Results:`);
    console.log(`   ✅ Successfully added: ${successCount} spots`);
    console.log(`   ❌ Failed: ${errorCount} spots`);
    console.log(`   📍 Total attempted: ${additionalSpots.length} spots`);
    console.log(`\n💾 Your database now has approximately ${20 + successCount} spots!`);
}

// Run the seed function
seedAdditionalSpots()
    .then(() => {
        console.log('\n✨ All done! Check your Supabase dashboard.');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n💥 Fatal error:', error);
        process.exit(1);
    });
