import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase";
import { requireAdmin } from "@/lib/admin-auth";

// All spots data from seed scripts
const ALL_SPOTS = [
    // ============================================
    // SEOUL, SOUTH KOREA (12 spots)
    // ============================================
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
        subcategories: ["Korean", "Market", "Traditional"],
        localley_score: 6,
        local_percentage: 90,
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
        name: { en: "Dongdaemun Design Plaza Night Market", ko: "동대문디자인플라자 야시장" },
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

    // ============================================
    // TOKYO, JAPAN (13 spots)
    // ============================================
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

    // ============================================
    // BANGKOK, THAILAND (13 spots)
    // ============================================
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

    // ============================================
    // SINGAPORE (12 spots)
    // ============================================
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
    },
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
    },
];

export async function GET(req: NextRequest) {
    try {
        // Require admin authentication
        const { response, userId } = await requireAdmin("/api/admin/seed-spots", "seed");
        if (response) return response;

        const supabase = createSupabaseAdmin();

        // Check current spot count
        const { count: existingCount } = await supabase
            .from("spots")
            .select("*", { count: "exact", head: true });

        if (existingCount && existingCount > 0) {
            return NextResponse.json({
                success: false,
                message: `Database already has ${existingCount} spots. Use POST with ?force=true to add more.`,
                existingCount,
            });
        }

        // Insert all spots
        let successCount = 0;
        let errorCount = 0;
        const errors: string[] = [];

        for (const spot of ALL_SPOTS) {
            const { error } = await supabase.from("spots").insert([spot]);

            if (error) {
                errorCount++;
                errors.push(`${(spot.name as {en: string}).en}: ${error.message}`);
            } else {
                successCount++;
            }
        }

        return NextResponse.json({
            success: true,
            message: `Seeded ${successCount} spots successfully`,
            successCount,
            errorCount,
            errors: errors.slice(0, 10), // Only show first 10 errors
            cities: {
                seoul: ALL_SPOTS.filter(s => (s.address as {en: string}).en.includes("Seoul")).length,
                tokyo: ALL_SPOTS.filter(s => (s.address as {en: string}).en.includes("Tokyo")).length,
                bangkok: ALL_SPOTS.filter(s => (s.address as {en: string}).en.includes("Bangkok")).length,
                singapore: ALL_SPOTS.filter(s => (s.address as {en: string}).en.includes("Singapore")).length,
            }
        });

    } catch (error) {
        console.error("Seed spots error:", error);
        return NextResponse.json(
            { error: "Failed to seed spots", details: String(error) },
            { status: 500 }
        );
    }
}

// POST to force add spots even if some exist
export async function POST(req: NextRequest) {
    try {
        const { response, userId } = await requireAdmin("/api/admin/seed-spots", "force-seed");
        if (response) return response;

        const { searchParams } = new URL(req.url);
        const force = searchParams.get("force") === "true";

        if (!force) {
            return NextResponse.json({
                error: "Use ?force=true to add spots when database is not empty"
            }, { status: 400 });
        }

        const supabase = createSupabaseAdmin();

        let successCount = 0;
        let errorCount = 0;
        let skipCount = 0;

        for (const spot of ALL_SPOTS) {
            // Check if spot already exists by name
            const { data: existing } = await supabase
                .from("spots")
                .select("id")
                .eq("name->>en", (spot.name as {en: string}).en)
                .single();

            if (existing) {
                skipCount++;
                continue;
            }

            const { error } = await supabase.from("spots").insert([spot]);

            if (error) {
                errorCount++;
            } else {
                successCount++;
            }
        }

        return NextResponse.json({
            success: true,
            message: `Added ${successCount} new spots, skipped ${skipCount} existing`,
            successCount,
            skipCount,
            errorCount,
        });

    } catch (error) {
        console.error("Force seed spots error:", error);
        return NextResponse.json(
            { error: "Failed to seed spots", details: String(error) },
            { status: 500 }
        );
    }
}
