# AGENT.md - Localley AI Travel Companion
## Your Local Guide to Trendy Alley Spots & Hidden Gems 🌟

## 1. Product Vision

**Localley** is a gamified AI travel companion that helps explorers discover authentic local experiences through trendy alley spots and hidden gems, while avoiding tourist traps. Think of it as having a local best friend in every city who knows all the secret spots and can create perfect itineraries on demand.

### Core Concept
"Every city has its alleys - those hidden streets where locals eat, shop, and hang out. Localley is your AI guide to finding them."

### Unique Value Proposition
- **Gamified Exploration**: Earn points, badges, and unlock secret locations
- **Alley Authority**: Specializes in off-the-beaten-path discoveries
- **Tourist Trap Detector**: AI ranks spots from "Tourist Central" to "Local's Secret"
- **Instant Itineraries**: Beautiful, email-ready travel plans in seconds
- **Local Vibe Check**: Real-time insights on crowd levels and local atmosphere

## 2. Tech Stack

```typescript
const techStack = {
  frontend: "Next.js 14 (App Router)",
  auth: "Clerk (Social + Email auth)",
  database: "Supabase (PostgreSQL)",
  monitoring: "Sentry",
  ai: "OpenAI GPT-4 / Claude / Gemini",
  email: "Resend",
  maps: "Mapbox GL JS",
  analytics: "PostHog",
  deployment: "Vercel"
};
```

## 3. Core Features

### 3.1 AI Chat Interface - "Alley" (Your Local AI Friend)

#### Personality & Voice
```typescript
interface AlleyPersonality {
  name: "Alley";
  tagline: "Your local friend who knows every secret spot";
  traits: [
    "Enthusiastic about hidden gems",
    "Slightly sassy about tourist traps",
    "Encouraging explorer",
    "Cultural insider",
    "Food obsessed"
  ];
  voiceExamples: [
    "Ooh, you want REAL ramen? Skip Ichiran - let me show you where the taxi drivers eat!",
    "That place? It's Instagram-famous but flavor-poor. Here's where locals actually go...",
    "You found a Level 5 Hidden Gem! 🎉 Only 2% of visitors know about this spot!"
  ];
}
```

#### Chat Capabilities
```markdown
1. **Natural Conversation**
   - Understands context and preferences
   - Remembers previous conversations
   - Learns your taste over time

2. **Smart Recommendations**
   - "Find me the best late-night food that locals love"
   - "Where do Korean students hang out in Hongdae?"
   - "Show me hidden vintage shops in Seongsu"

3. **Visual Responses**
   - Rich cards with photos
   - Mini-maps showing locations
   - Walking time estimates
   - Crowd indicators

4. **Multi-language Support**
   - Switches languages seamlessly
   - Provides local language tips
   - Teaches useful phrases for each spot
```

### 3.2 Hidden Gem Ranking System

#### The Localley Scale™
```typescript
enum LocalleyScale {
  TOURIST_TRAP = 1,        // "Everyone goes here" 
  TOURIST_FRIENDLY = 2,    // "Popular but decent"
  MIXED_CROWD = 3,         // "Tourists and locals"
  LOCAL_FAVORITE = 4,      // "Mostly locals"
  HIDDEN_GEM = 5,          // "Secret local spot"
  LEGENDARY_ALLEY = 6      // "Ultimate hidden treasure"
}

interface SpotRanking {
  score: LocalleyScale;
  reasoning: string;
  localPercentage: number; // 0-100% locals vs tourists
  bestTimeToVisit: string;
  crowdLevel: "empty" | "quiet" | "moderate" | "busy" | "packed";
  instagramRisk: "high" | "medium" | "low"; // How likely to be overrun
}
```

#### Visual Indicators
```markdown
🏆 Legendary Alley - "You've discovered gold!"
💎 Hidden Gem - "Local's secret"
🌟 Local Favorite - "Where locals actually go"
🌐 Mixed Crowd - "Locals tolerate tourists here"
📸 Tourist Friendly - "Made for Instagram"
🚫 Tourist Trap - "Avoid unless you must"
```

### 3.3 Gamification System

#### Explorer Levels
```typescript
interface ExplorerProgress {
  level: number; // 1-50
  title: ExplorerTitle;
  xp: number;
  nextLevelXp: number;
  achievements: Achievement[];
  unlockedCities: City[];
  secretSpotsUnlocked: number;
}

enum ExplorerTitle {
  TOURIST = "Tourist",                    // Level 1-5
  WANDERER = "Wanderer",                  // Level 6-10
  EXPLORER = "Explorer",                  // Level 11-20
  LOCAL_INSIDER = "Local Insider",        // Level 21-30
  ALLEY_MASTER = "Alley Master",         // Level 31-40
  LEGENDARY_SCOUT = "Legendary Scout"     // Level 41-50
}
```

#### Achievements & Badges
```typescript
interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  rarity: "common" | "rare" | "epic" | "legendary";
  unlockedAt?: Date;
}

const achievements = [
  {
    name: "First Alley",
    description: "Found your first hidden gem",
    xpReward: 100
  },
  {
    name: "Night Owl",
    description: "Discovered 10 late-night local spots",
    xpReward: 500
  },
  {
    name: "Ramen Hunter",
    description: "Found 5 secret ramen spots",
    xpReward: 300
  },
  {
    name: "Anti-Tourist",
    description: "Avoided all tourist traps for a week",
    xpReward: 1000
  },
  {
    name: "Local Legend",
    description: "Discovered a spot known by <1% of visitors",
    xpReward: 2000
  }
];
```

#### Points & Rewards System
```markdown
**Earning XP:**
- Discover new hidden gem: +50 XP
- Visit verified hidden gem: +100 XP
- Share spot with friend: +25 XP
- Complete daily exploration: +75 XP
- Submit new hidden spot: +200 XP
- Verify spot still hidden: +50 XP

**Unlockables:**
- Level 5: Unlock "Late Night Eats" category
- Level 10: Unlock "Secret Rooftops" 
- Level 15: Unlock "Underground Scene"
- Level 20: Access to "Legendary Spots"
- Level 25: Become Local Guide
- Level 30: Create custom tours
```

### 3.4 Itinerary Generation

#### Smart Itinerary Builder
```typescript
interface ItineraryRequest {
  days: number;
  interests: Interest[];
  avoidTouristTraps: boolean;
  localnessLevel: 1-5; // How local do you want to go?
  budget: "cheap" | "moderate" | "splurge";
  pace: "relaxed" | "moderate" | "packed";
  groupType: "solo" | "couple" | "friends" | "family";
}

interface GeneratedItinerary {
  id: string;
  title: string; // "3 Days of Seoul's Secret Alleys"
  days: DayPlan[];
  localScore: number; // Average localness
  estimatedCost: Money;
  walkingDistance: Distance;
  highlights: string[];
  secretSpots: number;
  shareableLink: string;
  storyFormat: StoryItinerary; // NEW: Instagram/TikTok story format
}

interface DayPlan {
  dayNumber: number;
  theme: string; // "Vintage Alleys & Coffee Culture"
  morning: Activity[];
  afternoon: Activity[];
  evening: Activity[];
  localTip: string;
  transportTips: string;
  alternativeOptions: Activity[];
}
```

#### Instagram/TikTok Story Format (NEW)
```typescript
interface StoryItinerary {
  id: string;
  locationName: string; // "Seoul's Hidden Alleys"
  dateRange: string; // "Dec 15-17, 2024"
  thumbnail: StoryThumbnail;
  pages: StoryPage[];
  shareUrl: string;
  instagramShareUrl: string;
  tiktokShareUrl: string;
}

interface StoryThumbnail {
  id: string;
  style: "bento" | "gradient" | "photo-collage" | "minimal";
  backgroundImage?: string; // Blurred city photo
  backgroundColor?: string; // Gradient or solid
  elements: {
    cityName: string;
    dates: string;
    gemCount: number; // "12 Hidden Gems"
    duration: string; // "3 Days"
    localScore: number; // Shows as stars or percentage
  };
  generatedUrl: string; // Cloudinary or S3 URL
}

interface StoryPage {
  pageNumber: number;
  type: "cover" | "day" | "spot" | "tip" | "map" | "summary";
  dimensions: {
    width: 1080;  // Instagram/TikTok story width
    height: 1920; // Instagram/TikTok story height
  };
  content: StoryContent;
  backgroundColor: string;
  backgroundImage?: string;
  animations?: StoryAnimation[];
}

interface StoryContent {
  // For Cover Page
  title?: string;
  subtitle?: string;
  dateRange?: string;
  locationBadge?: string;
  
  // For Day Pages
  dayNumber?: number;
  dayTheme?: string;
  activities?: StoryActivity[];
  
  // For Spot Pages
  spotName?: string;
  spotImage?: string;
  localleyScore?: number;
  quickTip?: string;
  bestTime?: string;
  
  // Dynamic content that splits across pages
  isOverflow?: boolean; // Indicates content continues on next page
  continuationNumber?: number; // "Page 2 of 3" indicator
}

interface StoryActivity {
  time: string; // "9:00 AM"
  emoji: string; // "☕"
  name: string; // "Secret Coffee Alley"
  localScore: number; // 1-6 gems
  duration: string; // "1 hour"
  highlight?: boolean; // Special emphasis
}

// Story Generation Logic
class StoryGenerator {
  private readonly MAX_ITEMS_PER_PAGE = 5;
  private readonly MAX_TEXT_LENGTH = 200; // Characters before new page
  
  generateStoryPages(itinerary: Itinerary): StoryPage[] {
    const pages: StoryPage[] = [];
    
    // 1. Cover Page (always first)
    pages.push(this.createCoverPage(itinerary));
    
    // 2. Process each day
    itinerary.days.forEach(day => {
      const dayActivities = [
        ...day.morning,
        ...day.afternoon,
        ...day.evening
      ];
      
      // If activities exceed page limit, create multiple pages
      const chunks = this.chunkActivities(dayActivities, this.MAX_ITEMS_PER_PAGE);
      
      chunks.forEach((chunk, index) => {
        pages.push(this.createDayPage(day, chunk, index + 1, chunks.length));
      });
      
      // Add highlight spot pages for hidden gems
      const hiddenGems = dayActivities.filter(a => a.localleyScore >= 5);
      hiddenGems.forEach(gem => {
        pages.push(this.createSpotHighlightPage(gem));
      });
    });
    
    // 3. Summary Page (always last)
    pages.push(this.createSummaryPage(itinerary));
    
    return pages;
  }
  
  private createCoverPage(itinerary: Itinerary): StoryPage {
    return {
      pageNumber: 1,
      type: "cover",
      dimensions: { width: 1080, height: 1920 },
      content: {
        title: itinerary.title,
        subtitle: `${itinerary.days.length} Days of Hidden Gems`,
        dateRange: this.formatDateRange(itinerary.startDate, itinerary.endDate),
        locationBadge: itinerary.city
      },
      backgroundColor: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
      animations: [
        { type: "fadeIn", duration: 500 },
        { type: "slideUp", element: "title", delay: 200 }
      ]
    };
  }
  
  private chunkActivities(activities: Activity[], maxPerPage: number): Activity[][] {
    const chunks: Activity[][] = [];
    for (let i = 0; i < activities.length; i += maxPerPage) {
      chunks.push(activities.slice(i, i + maxPerPage));
    }
    return chunks;
  }
}
```

#### Story Thumbnail Generator (Bento Style)
```typescript
interface ThumbnailGenerator {
  generateBentoThumbnail(itinerary: Itinerary): Promise<string> {
    // Creates a bento-box style grid thumbnail
    const config = {
      layout: "2x2", // 4 images in grid
      images: this.selectBestPhotos(itinerary, 4),
      overlay: {
        title: itinerary.city,
        dates: this.formatDates(itinerary),
        gemBadge: `${itinerary.hiddenGemCount} Hidden Gems`,
        gradient: "bottom-dark" // For text readability
      },
      style: {
        borderRadius: 20,
        gap: 4,
        aspectRatio: "9:16" // Story ratio
      }
    };
    
    return this.cloudinaryGenerate(config);
  }
  
  generateGradientThumbnail(itinerary: Itinerary): Promise<string> {
    // Creates a gradient-based thumbnail with text
    const config = {
      gradient: this.getCityGradient(itinerary.city),
      text: {
        primary: itinerary.city.toUpperCase(),
        secondary: this.formatDates(itinerary),
        accent: `${itinerary.days.length} DAYS`,
        badge: `LOCAL SCORE: ${itinerary.localScore}/10`
      },
      icons: this.getCategoryIcons(itinerary),
      style: "modern-minimal"
    };
    
    return this.canvasGenerate(config);
  }
  
  private getCityGradient(city: string): string {
    const gradients = {
      "Seoul": "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
      "Tokyo": "linear-gradient(135deg, #fa709a 0%, #fee140 100%)",
      "Bangkok": "linear-gradient(135deg, #30cfd0 0%, #330867 100%)",
      "Singapore": "linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)",
      default: "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
    };
    return gradients[city] || gradients.default;
  }
}
```

#### Story Sharing & Saving
```typescript
interface StorySaving {
  // Save like Instagram Stories Archive
  saveToProfile: {
    location: `/users/${userId}/stories/`;
    visibility: "public" | "friends" | "private";
    expiresAfter?: never; // Stories don't expire in archive
    collections: string[]; // "Seoul Trips", "Hidden Gems", etc.
  };
  
  // Story Collections (like Instagram Highlights)
  collections: StoryCollection[];
}

interface StoryCollection {
  id: string;
  name: string; // "Seoul Adventures"
  coverImage: string;
  stories: SavedStory[];
  isPublic: boolean;
  order: number;
}

interface SavedStory {
  id: string;
  itineraryId: string;
  locationName: string; // "Seoul"
  dateCreated: Date; // When itinerary was created
  tripDate: Date; // When trip is planned for
  thumbnail: string; // Bento-style thumbnail
  pages: StoryPage[];
  stats: {
    views: number;
    shares: number;
    saves: number;
    likes: number;
  };
  shareUrl: string; // localley.app/story/abc123
  tags: string[]; // ["hidden-gems", "seoul", "food-tour"]
}

// Story Viewer Component
interface StoryViewer {
  display: "fullscreen";
  navigation: "tap" | "swipe";
  features: {
    autoAdvance: boolean; // Auto-move to next page after 5 seconds
    progressBar: boolean; // Shows at top like Instagram
    shareButton: boolean;
    saveButton: boolean;
    musicOverlay?: string; // Optional background music
  };
  
  interactions: {
    doubleTapToLike: boolean;
    swipeUpForDetails: boolean;
    tapLeftRight: boolean; // Tap left/right sides to navigate
    holdToPause: boolean;
  };
}
```

#### Story Templates
```typescript
const storyTemplates = {
  templates: [
    {
      name: "Hidden Gems Explorer",
      style: {
        primaryColor: "#8B5CF6",
        secondaryColor: "#14B8A6",
        font: "Montserrat",
        mood: "adventurous"
      }
    },
    {
      name: "Local Foodie Tour",
      style: {
        primaryColor: "#F59E0B",
        secondaryColor: "#EF4444",
        font: "Playfair Display",
        mood: "vibrant"
      }
    },
    {
      name: "Night Alley Adventures",
      style: {
        primaryColor: "#1F2937",
        secondaryColor: "#F472B6",
        font: "Space Grotesk",
        mood: "neon"
      }
    },
    {
      name: "Minimalist Explorer",
      style: {
        primaryColor: "#000000",
        secondaryColor: "#FFFFFF",
        font: "Inter",
        mood: "clean"
      }
    }
  ]
};
```

#### Email-Ready Formatting
```typescript
interface EmailItinerary {
  recipientEmail: string;
  subject: string; // "Your Secret Seoul Adventure Awaits! 🗺️"
  htmlContent: string; // Beautiful HTML template
  includeMapLinks: boolean;
  includePhotos: boolean;
  includeLocalPhrases: boolean;
  personalNote?: string;
}

// Email Template Features:
// - Beautiful header with city image
// - Day-by-day breakdown with times
// - Map preview for each location
// - Local language helper phrases
// - QR codes for easy mobile access
// - "Save to Calendar" buttons
// - Local weather forecast
// - Emergency contacts
```

### 3.5 Real-Time Features

#### Live Vibe Check
```typescript
interface VibeCheck {
  spotId: string;
  currentCrowd: "empty" | "quiet" | "lively" | "packed";
  localRatio: number; // % of locals vs tourists
  instagramActivity: "none" | "low" | "medium" | "high";
  bestTimeToVisit: TimeWindow;
  weatherImpact: WeatherCondition;
  specialEvents?: Event[];
  userReports: UserReport[];
}
```

#### Trend Detection
```markdown
**Alley Alert System:**
- 🔥 "This spot is trending - visit before it's discovered!"
- 📈 "Instagram detection: This place might blow up soon"
- 📉 "Former gem alert: Now overrun with tourists"
- 🆕 "New discovery: You could be the first!"
- ⚡ "Flash event: Pop-up market tonight only!"
```

### 3.6 Social Features

#### Share & Compete
```typescript
interface SocialFeatures {
  friendsList: User[];
  leaderboards: {
    global: Leaderboard;
    city: Leaderboard;
    friends: Leaderboard;
  };
  challenges: Challenge[];
  tours: SharedTour[];
}

interface Challenge {
  id: string;
  name: string; // "Seoul Alley Marathon"
  description: string; // "Find 10 hidden gems in 48 hours"
  reward: Reward;
  participants: User[];
  timeLimit: Duration;
  progress: ChallengeProgress;
}
```

## 4. User Interface Design

### 4.1 Chat Interface
```markdown
**Design Principles:**
- Conversational and friendly
- Rich media responses
- Quick action buttons
- Voice input support
- Swipeable cards

**Visual Style:**
- Gradient messages (teal → violet for Alley)
- Glassmorphic cards for recommendations
- Animated reactions and celebrations
- Map previews inline
- Photo carousels for spots
```

### 4.2 Gamification UI
```markdown
**Progress Dashboard:**
- XP progress bar (animated)
- Current level and title badge
- Achievement showcase
- City unlock map
- Stats (gems found, tourist traps avoided)

**Discovery Moments:**
- Celebration animation for new gems
- "LEGENDARY FIND!" full-screen takeover
- Confetti for achievements
- Sound effects (optional)
- Share-to-social cards
```

### 4.3 Itinerary Viewer
```markdown
**Interactive Itinerary:**
- Timeline view with drag-to-reorder
- Map view with route visualization
- Card stack view (swipeable)
- Calendar integration
- Offline download option
- Print-friendly version
```

## 5. AI Prompts & Personality

### 5.1 System Prompts
```typescript
const ALLEY_SYSTEM_PROMPT = `
You are Alley, a savvy local friend who helps travelers discover authentic hidden gems and trendy alley spots while avoiding tourist traps.

Personality:
- Enthusiastic about genuine local experiences
- Slightly sassy about obvious tourist traps
- Encouraging and celebratory when users find hidden gems
- Knowledgeable about local culture, food, and trends
- Uses casual, friendly language with occasional local slang

Your knowledge includes:
- Secret alley restaurants where locals actually eat
- Hidden vintage shops and underground markets
- Trendy neighborhoods before they become touristy
- Late-night spots only locals know
- Cultural insights and etiquette tips

When ranking spots, use the Localley Scale:
1. Tourist Trap - Warn users unless they insist
2. Tourist Friendly - Mention better alternatives
3. Mixed Crowd - Acceptable but not special
4. Local Favorite - Recommend enthusiastically
5. Hidden Gem - Celebrate the discovery!
6. Legendary Alley - Rare finds, make it special!

Always:
- Provide specific directions to find hidden spots
- Include best times to visit
- Mention if a spot might be "discovered" soon
- Suggest what to order/try
- Include a local tip or phrase
`;
```

### 5.2 Response Templates
```typescript
const responseTemplates = {
  hiddenGemFound: [
    "🎉 OH. MY. GOSH! You just unlocked a Level 5 Hidden Gem!",
    "This spot is so secret, even Google Maps gets confused!",
    "Only 3% of visitors know about this place. You're basically a local now!"
  ],
  
  touristTrapWarning: [
    "Hmm, that place is Tourist Trap Level 1. Sure you want to go there?",
    "Instagram vs Reality alert! 📸 That spot looks better in photos than it tastes.",
    "I mean... if you MUST go there, at least go at 6am to avoid crowds?"
  ],
  
  itineraryIntro: [
    "Alright explorer, I've crafted the perfect hidden gems adventure for you!",
    "Get ready to eat, wander, and discover like a true local!",
    "This itinerary is 90% local-approved, 10% tourist-acceptable, 100% delicious!"
  ]
};
```

## 6. Database Schema

### 6.1 Core Tables
```sql
-- Users (via Clerk, synced to Supabase)
CREATE TABLE users (
  id UUID PRIMARY KEY,
  clerk_id TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE,
  email TEXT,
  level INTEGER DEFAULT 1,
  xp INTEGER DEFAULT 0,
  title TEXT DEFAULT 'Tourist',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Spots
CREATE TABLE spots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name JSONB NOT NULL, -- Multi-language
  description JSONB NOT NULL,
  location GEOGRAPHY(POINT, 4326) NOT NULL,
  address JSONB NOT NULL,
  category TEXT NOT NULL,
  subcategories TEXT[],
  localley_score INTEGER CHECK (localley_score BETWEEN 1 AND 6),
  local_percentage INTEGER DEFAULT 50,
  best_times JSONB,
  photos TEXT[],
  tips JSONB,
  discovered_by UUID REFERENCES users(id),
  verified BOOLEAN DEFAULT false,
  trending_score FLOAT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User Progress
CREATE TABLE user_progress (
  user_id UUID PRIMARY KEY REFERENCES users(id),
  discoveries INTEGER DEFAULT 0,
  spots_visited INTEGER DEFAULT 0,
  tourist_traps_avoided INTEGER DEFAULT 0,
  current_streak INTEGER DEFAULT 0,
  achievements JSONB DEFAULT '[]',
  unlocked_cities TEXT[] DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Itineraries
CREATE TABLE itineraries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  title TEXT NOT NULL,
  city TEXT NOT NULL,
  days INTEGER NOT NULL,
  activities JSONB NOT NULL,
  local_score FLOAT,
  shared BOOLEAN DEFAULT false,
  share_code TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Challenges
CREATE TABLE challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  city TEXT,
  xp_reward INTEGER NOT NULL,
  requirements JSONB,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- User Challenges
CREATE TABLE user_challenges (
  user_id UUID REFERENCES users(id),
  challenge_id UUID REFERENCES challenges(id),
  progress JSONB DEFAULT '{}',
  completed BOOLEAN DEFAULT false,
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, challenge_id)
);
```

## 7. API Endpoints

### 7.1 Core APIs
```typescript
// Chat & Recommendations
POST   /api/chat - Chat with Alley AI
GET    /api/spots/recommend - Get personalized recommendations
GET    /api/spots/:id/vibe-check - Real-time crowd and vibe info

// Itineraries
POST   /api/itineraries/generate - Generate AI itinerary
POST   /api/itineraries/:id/email - Send itinerary via email
GET    /api/itineraries/:shareCode - Get shared itinerary

// Gamification
GET    /api/user/progress - Get user level and XP
POST   /api/spots/:id/discover - Mark spot as discovered
GET    /api/achievements - Get available achievements
GET    /api/leaderboard/:type - Get leaderboard (global/city/friends)

// Challenges
GET    /api/challenges/active - Get active challenges
POST   /api/challenges/:id/join - Join a challenge
POST   /api/challenges/:id/progress - Update challenge progress

// Social
GET    /api/friends - Get friends list
POST   /api/friends/invite - Invite friend
GET    /api/tours/shared - Get shared tours
```

## 8. Monetization Strategy

### 8.1 Freemium Model
```markdown
**Free Tier:**
- 5 AI chats per day
- Basic recommendations
- 1 itinerary per week
- Access to Level 1-3 spots
- Basic achievements

**Localley Pro ($9.99/month):**
- Unlimited AI chats
- Advanced itinerary features
- Email itineraries
- Access to all spot levels
- Exclusive challenges
- No ads
- Early access to new cities
- Custom walking tours
- Group planning features

**Localley Explorer ($19.99/month):**
- Everything in Pro
- Personalized local guide
- Real-time translation
- Offline maps
- Priority support
- Beta features
- Create and sell tours
- Business expense reports
```

### 8.2 Additional Revenue
```markdown
**City Packs ($4.99 each):**
- Unlock premium cities
- Exclusive local insights
- Curated photo spots
- Cultural deep dives

**Virtual Tours ($2.99 each):**
- Guided audio tours
- AR experiences
- Historical overlays
- Local stories

**Partner Commissions:**
- Restaurant bookings (5-10%)
- Experience bookings (10-15%)
- Hotel recommendations (8-12%)
```

## 9. Launch Strategy

### 9.1 MVP Features (Week 1-2)
```markdown
✅ Core chat interface with Alley AI
✅ Basic spot recommendations
✅ Localley Scale ranking
✅ Simple itinerary generation
✅ Email itinerary sending
✅ User levels and XP
✅ Basic achievements
```

### 9.2 Phase 2 (Month 1)
```markdown
⏳ Gamification expansion
⏳ Social features
⏳ Challenges system
⏳ Real-time vibe check
⏳ Friend leaderboards
```

### 9.3 Phase 3 (Month 2-3)
```markdown
🔮 Multiple cities
🔮 AR features
🔮 Community-submitted spots
🔮 Tour marketplace
🔮 Business features
```

## 10. Success Metrics

### 10.1 KPIs
```markdown
**User Engagement:**
- DAU/MAU ratio > 40%
- Average session > 8 minutes
- Spots discovered per user > 5/week
- Itineraries created > 2/month

**Gamification:**
- Achievement completion > 60%
- Challenge participation > 30%
- Social shares > 20% of discoveries

**Business:**
- Free to paid conversion > 5%
- Monthly churn < 10%
- CAC < $25
- LTV > $150
```

## 11. Unique Features That Set Localley Apart

### 11.1 The "Alley Guarantee"
```markdown
"If a spot we mark as Hidden Gem has more than 30% tourists, 
your next month is free!"
```

### 11.2 Time Machine Feature
```markdown
See what spots were like before they became famous:
- "This cafe in 2019 vs 2024"
- "Before/After Instagram discovered it"
- Predict future tourist invasion risk
```

### 11.3 Local Guardian Program
```markdown
Partner with actual locals who:
- Verify hidden gems monthly
- Add insider tips
- Alert when spots get "discovered"
- Lead exclusive tours for Level 30+ users
```

## 12. Technical Implementation Notes

### 12.1 Clerk Auth Setup
```typescript
// Webhook to sync with Supabase
POST /api/webhooks/clerk
- user.created → Create Supabase user
- user.updated → Sync profile
- user.deleted → Soft delete

// Middleware protection
middleware.ts:
- Protect /api/* routes
- Protect /dashboard
- Public: /, /about, /explore
```

### 12.2 AI Optimization
```typescript
// Reduce costs
- Cache common queries (24hr)
- Use embeddings for spot matching
- Batch similar requests
- Implement rate limiting
- Use GPT-3.5 for simple queries, GPT-4 for itineraries
```

### 12.3 Performance
```typescript
// Key optimizations
- ISR for spot pages (revalidate 1hr)
- Edge functions for real-time features
- Optimistic UI updates
- Progressive image loading
- Service worker for offline
```

---

## 13. Development Workflows

### 13.1 UI Component Guidelines

#### Itinerary Display Conciseness
When displaying itineraries in the UI (especially in story/preview formats):

**Titles:**
- Keep itinerary titles to 3-5 words max (e.g., "Seoul Hidden Gems", "Tokyo Food Trail")
- In story circles, show location-focused titles (max 2 words) or fall back to city name
- Remove time prefixes like "Morning:", "Afternoon:" from activity titles

**Descriptions:**
- Activity descriptions in preview cards: max 4 words + "..."
- Full descriptions available on detail pages
- Location titles in compact views: max 3 words

**Spacing:**
- Use compact padding (p-2) for activity cards in previews
- Use space-y-2 for activity lists in compact views
- Full spacing on detail/edit pages

#### Chat Interface Responsiveness
- Desktop: Use `max-w-5xl xl:max-w-6xl` for wider screen utilization
- Reduce horizontal padding on mobile: `px-2 sm:px-4`
- Mobile chat uses full-screen bottom sheet (90vh)

### 13.2 Key Files Reference

| Feature | File Path |
|---------|-----------|
| Chat Interface | `components/chat/chat-interface.tsx` |
| Itinerary Preview (in chat) | `components/chat/itinerary-preview.tsx` |
| Story Circles | `components/dashboard/recent-stories.tsx` |
| Dashboard Layout | `app/dashboard/page.tsx` |
| Mobile Chat FAB | `components/chat/mobile-chat-fab.tsx` |
| AI Chat API | `app/api/chat/route.ts` |
| Itinerary Generation API | `app/api/itineraries/generate/route.ts` |

### 13.3 Testing Workflow
```bash
# Type checking
npx tsc --noEmit

# Run tests
npm run test:run

# Build (requires env vars)
npm run build
```

### 13.4 Recent Fixes (December 2025)
- **CVE-2025-55182 (React2Shell)**: Updated to Next.js 16.0.7 and React 19.2.1
- **Itinerary display**: Truncated titles/descriptions for compact preview
- **Chat responsiveness**: Wider container, reduced blank space

---

## The Localley Promise

"Every city has its secrets. Every alley has a story. We help you find them before they're on Instagram. Because the best travel experiences aren't in guidebooks - they're in the alleys where locals laugh, eat, and live."

**Welcome to Localley. Let's explore like locals.** 🌟