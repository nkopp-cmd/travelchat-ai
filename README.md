# TravelChat AI - Localley

AI-powered travel itinerary platform that helps travelers discover authentic hidden gems and local favorites while avoiding tourist traps.

## Features

### 🗺️ AI-Powered Itinerary Generation
- Generate personalized day-by-day travel plans
- Template-based quick starts (Weekend Getaway, Week Adventure, etc.)
- Chat with Alley, your local travel AI assistant
- Save and manage multiple itineraries

### 💎 Hidden Gems Discovery
- Localley Score (1-6) rating system
- Hidden Gem spots with insider knowledge
- Local Favorite recommendations
- Spot discovery and browsing

### 🎯 Smart Recommendations
- Personalized spot suggestions based on your travel history
- Category preference analysis
- Compact dashboard integration

### ✏️ Itinerary Management
- Edit and revise saved itineraries
- Chat-based itinerary revision
- Export itineraries
- Share with friends

### 🎫 Viator Integration
- Browse local tours and activities
- Earn up to 12% commission
- Integrated activity booking

## Tech Stack

- **Framework**: Next.js 16.0.3 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **UI Components**: shadcn/ui
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Clerk
- **AI**: GLM 5.2 primary with OpenAI fallback
- **Monitoring**: Sentry
- **Deployment**: Vercel

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Supabase account
- Clerk account
- GLM/Z.AI API key
- OpenAI API key for fallback

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/travelchat-ai.git
cd travelchat-ai
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:

Create a `.env.local` file with:

```env
# Clerk Authentication
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
CLERK_SECRET_KEY=your_clerk_secret_key

# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Chat AI - GLM 5.2 primary
GLM_API_KEY=your_glm_or_zai_api_key
# ZAI_API_KEY=your_glm_or_zai_api_key # Optional alias supported by the app
GLM_MODEL=glm-5.2 # Optional, defaults to glm-5.2
# Optional, defaults to Z.AI's OpenAI-compatible endpoint. Blank values are ignored.
# GLM_BASE_URL=https://api.z.ai/api/paas/v4/

# OpenAI fallback
OPENAI_API_KEY=your_openai_api_key

# Viator (Optional)
VIATOR_API_KEY=your_viator_api_key

# Sentry (Optional)
NEXT_PUBLIC_SENTRY_DSN=your_sentry_dsn

# App URL
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

4. Set up Supabase database:

Run the SQL script in `supabase/schema.sql` in your Supabase SQL editor.

5. Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Project Structure

```
├── app/                      # Next.js App Router
│   ├── api/                  # API routes
│   │   ├── chat/            # Chat with Alley
│   │   ├── itineraries/     # Itinerary CRUD
│   │   ├── spots/           # Spot discovery
│   │   ├── recommendations/ # Personalized recommendations
│   │   └── viator/          # Viator integration
│   ├── dashboard/           # Main dashboard
│   ├── itineraries/         # Itinerary management
│   ├── spots/               # Spot browsing
│   ├── templates/           # Itinerary templates
│   └── layout.tsx           # Root layout
├── components/              # React components
│   ├── chat/               # Chat interface components
│   ├── dashboard/          # Dashboard widgets
│   ├── itineraries/        # Itinerary components
│   ├── spots/              # Spot components
│   └── ui/                 # shadcn/ui components
├── lib/                     # Utilities and helpers
│   ├── supabase.ts         # Supabase client
│   ├── recommendations.ts  # Recommendation engine
│   └── viator.ts           # Viator API client
├── types/                   # TypeScript type definitions
├── hooks/                   # Custom React hooks
└── public/                  # Static assets
```

## Key Features Implementation

### Chat Itinerary Feature

The chat interface can detect and render itineraries as beautiful cards with save functionality:

- Supports both `**Day 1:**` and `### Day 1:` markdown formats
- Parses activities in multiple formats
- Real-time save to database
- City extraction from title
- Activity type detection (Hidden Gem, Local Favorite)

See [CHAT_ITINERARY_FIX_FINAL.md](CHAT_ITINERARY_FIX_FINAL.md) for detailed documentation.

### Recommendation Engine

Analyzes user's itinerary history to provide personalized spot recommendations:

- Category preference analysis
- Weighted scoring algorithm (0-100 points)
- Fallback to default recommendations for new users
- Compact dashboard banner integration

### SEO Optimization

- Dynamic metadata generation
- OpenGraph and Twitter Card tags
- JSON-LD structured data
- Dynamic sitemap
- Custom robots.txt

## Scripts

```bash
# Development
npm run dev              # Start dev server
npm run build           # Build for production
npm run start           # Start production server

# Code Quality
npm run lint            # Run ESLint
npm run type-check      # Run TypeScript compiler

# Testing
node scripts/pre-deployment-check.js  # Run 44 automated checks
```

## Database Schema

Key tables:
- `users` - User profiles (synced with Clerk)
- `itineraries` - Saved travel plans
- `spots` - Hidden gems and local favorites
- `conversations` - Chat history
- `messages` - Individual chat messages

See `supabase/schema.sql` for complete schema.

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License.

## Support

For issues and questions:
- Create an issue on GitHub
- Email: support@localley.com

## Acknowledgments

- OpenAI for GPT-4 API
- Vercel for hosting
- Supabase for backend infrastructure
- Clerk for authentication
- shadcn for beautiful UI components
