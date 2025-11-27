# 🚀 Localley - Quick Reference Guide

**Last Updated:** November 24, 2025  
**Version:** 0.1.0 Alpha

---

## 📁 Project Structure

```
travelchat-ai/
├── app/                          # Next.js App Router pages
│   ├── api/                      # API routes
│   │   ├── chat/                 # OpenAI chat endpoint
│   │   ├── conversations/        # Conversation CRUD
│   │   ├── gamification/         # XP awarding
│   │   └── itineraries/          # Itinerary endpoints (TODO)
│   ├── dashboard/                # Main dashboard page
│   ├── itineraries/              # Itinerary pages
│   ├── profile/                  # User profile
│   ├── settings/                 # User settings
│   ├── sign-in/                  # Auth pages
│   ├── sign-up/
│   ├── spots/                    # Spots discovery
│   ├── layout.tsx                # Root layout
│   ├── page.tsx                  # Landing page
│   └── globals.css               # Global styles
├── components/                   # React components
│   ├── chat/                     # Chat interface
│   ├── dashboard/                # Dashboard components
│   ├── layout/                   # Layout components
│   ├── spots/                    # Spot components
│   └── ui/                       # Shadcn UI components
├── lib/                          # Utility functions
│   ├── gamification.ts           # XP/leveling logic
│   ├── supabase.ts               # Supabase client
│   └── utils.ts                  # Helper functions
├── supabase/                     # Database schema
│   ├── schema.sql                # Main schema
│   ├── conversations.sql         # Chat tables
│   ├── indexes.sql               # Performance indexes
│   └── rls-policies.sql          # Security policies
├── types/                        # TypeScript types
├── public/                       # Static assets
├── AGENT.md                      # Product specification
├── IMPLEMENTATION_PLAN.md        # Development roadmap
├── TASK.md                       # Task list
├── STATUS_REPORT.md              # Current state
├── SUMMARY.md                    # Executive summary
├── E2E_TEST_CHECKLIST.md         # Testing guide
└── README.md                     # Getting started
```

---

## 🔑 Key Files

### Configuration
- **`.env.local`** - Environment variables (gitignored)
- **`next.config.ts`** - Next.js configuration
- **`tailwind.config.ts`** - TailwindCSS theme
- **`tsconfig.json`** - TypeScript settings
- **`middleware.ts`** - Clerk auth middleware

### Core Components
- **`components/chat/chat-interface.tsx`** - Main chat UI
- **`components/spots/spot-card.tsx`** - Spot display card
- **`components/layout/header.tsx`** - App header
- **`lib/gamification.ts`** - XP/leveling system

### API Routes
- **`app/api/chat/route.ts`** - OpenAI integration
- **`app/api/conversations/route.ts`** - Chat persistence
- **`app/api/gamification/award-xp/route.ts`** - XP system

---

## 🛠️ Common Commands

### Development
```bash
npm run dev          # Start dev server (Turbopack)
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
```

### Database
```bash
# Run in Supabase SQL Editor:
# 1. supabase/schema.sql
# 2. supabase/conversations.sql
# 3. supabase/indexes.sql
# 4. supabase/rls-policies.sql
```

### Testing (TODO)
```bash
npm run test         # Run tests (not implemented)
npm run test:e2e     # Run E2E tests (not implemented)
```

---

## 🔐 Environment Variables

Required in `.env.local`:

```bash
# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# OpenAI
OPENAI_API_KEY=sk-...

# Mapbox
NEXT_PUBLIC_MAPBOX_TOKEN=pk.eyJ...

# Optional
RESEND_API_KEY=re_...  # For email (TODO)
```

---

## 📊 Database Schema Quick Reference

### Main Tables

**users**
- `id` (UUID) - Primary key
- `clerk_id` (TEXT) - Clerk user ID
- `username`, `email`
- `level`, `xp`, `title`

**spots**
- `id` (UUID) - Primary key
- `name`, `description` (JSONB) - Multi-language
- `location` (GEOGRAPHY) - PostGIS point
- `category`, `subcategories`
- `localley_score` (1-6)
- `photos`, `tips`

**user_progress**
- `user_id` (UUID) - Foreign key to users
- `discoveries`, `spots_visited`
- `current_streak`
- `achievements` (JSONB)

**itineraries**
- `id` (UUID) - Primary key
- `user_id` - Foreign key
- `title`, `city`, `days`
- `activities` (JSONB)
- `local_score`

**conversations** & **messages**
- Chat history storage
- Linked to users

---

## 🎨 Design System

### Colors
```css
/* Primary */
--violet-600: #7c3aed
--indigo-600: #4f46e5

/* Gradients */
from-violet-600 to-indigo-600
from-violet-500/10 to-indigo-500/10

/* Text */
--foreground: white (dark mode)
--muted-foreground: gray-400
```

### Typography
- **Font:** Geist (Next.js default)
- **Headings:** Bold, tracking-tight
- **Body:** Regular, leading-relaxed

### Components
- **Buttons:** Rounded-full, gradient backgrounds
- **Cards:** Rounded-2xl/3xl, glassmorphism
- **Inputs:** Rounded-full, backdrop-blur

---

## 🎮 Gamification System

### Levels (1-50)
```typescript
Level 1-5:   Tourist
Level 6-10:  Wanderer
Level 11-20: Explorer
Level 21-30: Local Insider
Level 31-40: Alley Master
Level 41-50: Legendary Scout
```

### XP Thresholds
```typescript
Level 1: 0 XP
Level 2: 100 XP
Level 3: 250 XP
Level 5: 750 XP
Level 10: 3000 XP
Level 20: 15000 XP
Level 50: 200000 XP
```

### XP Awards
- Discover spot: +50 XP
- Visit spot: +100 XP
- Complete challenge: +200-1000 XP
- Daily streak: +75 XP
- Share spot: +25 XP

---

## 🗺️ Localley Scale™

```
6 - 🏆 Legendary Alley    "Ultimate hidden treasure"
5 - 💎 Hidden Gem         "Secret local spot"
4 - 🌟 Local Favorite     "Mostly locals"
3 - 🌐 Mixed Crowd        "Tourists and locals"
2 - 📸 Tourist Friendly   "Popular but decent"
1 - 🚫 Tourist Trap       "Everyone goes here"
```

---

## 🤖 Alley AI Personality

### Traits
- Enthusiastic about hidden gems
- Slightly sassy about tourist traps
- Encouraging explorer
- Cultural insider
- Food obsessed

### Example Responses
```
"Ooh, you want REAL ramen? Skip Ichiran - let me show you 
where the taxi drivers eat!"

"That place? It's Instagram-famous but flavor-poor. 
Here's where locals actually go..."

"You found a Level 5 Hidden Gem! 🎉 Only 2% of visitors 
know about this spot!"
```

---

## 🔧 Troubleshooting

### Dev Server Won't Start
```bash
# Clear Next.js cache
rm -rf .next
npm run dev
```

### Database Connection Issues
1. Check Supabase URL and keys in `.env.local`
2. Verify RLS policies are set up
3. Check network connection

### Clerk Auth Not Working
1. Verify Clerk keys in `.env.local`
2. Check middleware.ts is configured
3. Ensure sign-in/sign-up URLs match

### OpenAI API Errors
1. Check API key is valid
2. Verify billing is active
3. Check rate limits

### Mapbox Not Loading
1. Verify Mapbox token
2. Check token permissions (public)
3. Ensure token is in `.env.local`

---

## 📱 Pages & Routes

### Public Routes
- `/` - Landing page
- `/sign-in` - Sign in
- `/sign-up` - Sign up

### Protected Routes (Require Auth)
- `/dashboard` - Main dashboard with chat
- `/spots` - Discover spots
- `/spots/[id]` - Spot details
- `/itineraries` - Your itineraries
- `/itineraries/[id]` - Itinerary details
- `/itineraries/new` - Create itinerary
- `/profile` - User profile
- `/settings` - User settings

### API Routes
- `POST /api/chat` - Send chat message
- `GET /api/conversations` - List conversations
- `POST /api/conversations` - Create conversation
- `POST /api/conversations/messages` - Save message
- `POST /api/gamification/award-xp` - Award XP

---

## 🎯 Current Priorities

### This Week
1. ✅ Fix lint errors
2. ✅ Seed database with spots
3. ✅ Implement itinerary generation
4. ✅ Add spots search/filters

### Next Week
1. Story format itinerary viewer
2. Email export functionality
3. Interactive dashboard map
4. Real-time vibe check

---

## 📚 Documentation

### Internal Docs
- **AGENT.md** - Full product spec
- **IMPLEMENTATION_PLAN.md** - Development roadmap
- **TASK.md** - Task list with priorities
- **STATUS_REPORT.md** - Current state analysis
- **SUMMARY.md** - Executive summary
- **E2E_TEST_CHECKLIST.md** - Testing guide

### External Resources
- [Next.js Docs](https://nextjs.org/docs)
- [Clerk Docs](https://clerk.com/docs)
- [Supabase Docs](https://supabase.com/docs)
- [OpenAI API](https://platform.openai.com/docs)
- [Mapbox Docs](https://docs.mapbox.com)
- [TailwindCSS](https://tailwindcss.com/docs)

---

## 🐛 Known Issues

### Critical
- Database empty (needs seeding)
- Itinerary generation not implemented

### High
- 7 lint errors, 8 warnings
- Conversation history doesn't load
- No spots search/filters

### Medium
- Stories are placeholders
- Some pages use mock data

---

## 📞 Quick Links

- **Dev Server:** http://localhost:3000
- **Supabase Dashboard:** https://supabase.com/dashboard
- **Clerk Dashboard:** https://dashboard.clerk.com
- **Vercel Dashboard:** https://vercel.com/dashboard

---

## 💡 Tips & Best Practices

### Code Style
- Use TypeScript for all new files
- Follow Next.js App Router conventions
- Use Tailwind utility classes
- Keep components small and focused

### Database
- Always use RLS policies
- Use prepared statements (Supabase handles this)
- Index frequently queried fields
- Use JSONB for flexible data

### Performance
- Use Next.js Image component
- Lazy load heavy components
- Implement pagination for lists
- Cache API responses

### Security
- Never commit `.env.local`
- Use environment variables for secrets
- Validate all user input
- Implement rate limiting (TODO)

---

**Quick Reference Version:** 1.0  
**Maintained By:** Development Team  
**Last Review:** November 24, 2025
