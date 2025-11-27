# Task List - Localley AI Travel Companion

## 🎯 Current Sprint Tasks

### 🔴 Critical Priority

#### 1. Fix Lint Errors
**Status:** Not Started  
**Assigned:** -  
**Estimated Time:** 30 minutes

**Tasks:**
- [ ] Fix unescaped quotes in `app/page.tsx` (6 errors)
  - Replace `"` with `&quot;` in line 101
- [ ] Fix explicit `any` type in `app/spots/[id]/page.tsx`
  - Add proper type definition for spot parameter
- [ ] Remove unused imports across files:
  - [ ] `app/itineraries/[id]/page.tsx` - Remove `Clock`
  - [ ] `app/profile/page.tsx` - Remove `Calendar`, `LEVEL_THRESHOLDS`
  - [ ] `components/chat/chat-interface.tsx` - Remove `MapPin`, `Sparkles`, `AvatarImage`, `Card`

**Acceptance Criteria:**
- All lint errors resolved
- All lint warnings resolved
- `npm run lint` passes with no errors

---

#### 2. Create Database Seed Script
**Status:** Not Started  
**Assigned:** -  
**Estimated Time:** 2 hours

**Tasks:**
- [ ] Create `scripts/seed-spots.ts` with sample spot data
- [ ] Add spots for multiple cities (Seoul, Tokyo, Bangkok, Singapore)
- [ ] Include diverse categories (food, cafes, bars, shopping, culture)
- [ ] Set realistic Localley scores (1-6)
- [ ] Add photos URLs (Unsplash or similar)
- [ ] Include tips and best times
- [ ] Add geolocation data (lat/lng)
- [ ] Create npm script to run seeding
- [ ] Document seeding process in README

**Sample Data Needed:**
- 50+ spots across 4-5 cities
- Mix of Localley scores (emphasis on 4-6)
- Realistic descriptions and tips
- Valid coordinates

**Acceptance Criteria:**
- Seed script successfully populates database
- Spots appear on spots page
- Spot details page works with real data
- Map markers display correctly

---

### 🟠 High Priority

#### 3. Implement AI Itinerary Generation
**Status:** Not Started  
**Assigned:** -  
**Estimated Time:** 4 hours

**Tasks:**
- [ ] Create `/api/itineraries/generate` endpoint
- [ ] Design itinerary generation prompt for OpenAI
- [ ] Implement itinerary parser (JSON response)
- [ ] Save generated itinerary to database
- [ ] Create itinerary generation form component
- [ ] Add loading states during generation
- [ ] Handle errors gracefully
- [ ] Test with various inputs (days, interests, budget)

**API Endpoint Spec:**
```typescript
POST /api/itineraries/generate
Body: {
  city: string;
  days: number;
  interests: string[];
  budget: "cheap" | "moderate" | "splurge";
  localnessLevel: 1-5;
  pace: "relaxed" | "moderate" | "packed";
}
Response: {
  itinerary: Itinerary;
}
```

**Acceptance Criteria:**
- API generates realistic itineraries
- Itineraries include spots from database
- Itineraries saved to user's account
- Generation takes < 10 seconds
- Error handling for API failures

---

#### 4. Add Spots Search & Filters
**Status:** Not Started  
**Assigned:** -  
**Estimated Time:** 3 hours

**Tasks:**
- [ ] Create search input component
- [ ] Add filter dropdowns (category, score, city)
- [ ] Implement client-side filtering
- [ ] Add sort options (score, trending, newest)
- [ ] Create `/api/spots/search` endpoint (optional)
- [ ] Add "No results" state
- [ ] Persist filters in URL params
- [ ] Add clear filters button

**Filters Needed:**
- Search by name/description
- Filter by category
- Filter by Localley score (1-6)
- Filter by city
- Sort by: score, trending, newest

**Acceptance Criteria:**
- Search works in real-time
- Filters combine correctly
- URL params update with filters
- Performance is smooth with 100+ spots

---

### 🟡 Medium Priority

#### 5. Story Format Itinerary Viewer
**Status:** Not Started  
**Assigned:** -  
**Estimated Time:** 6 hours

**Tasks:**
- [ ] Create `StoryViewer` component
- [ ] Implement fullscreen story view
- [ ] Add tap/swipe navigation
- [ ] Create story page templates:
  - [ ] Cover page
  - [ ] Day overview page
  - [ ] Spot highlight page
  - [ ] Summary page
- [ ] Add progress bar at top
- [ ] Implement auto-advance (5s per page)
- [ ] Add share button
- [ ] Generate story thumbnail (Bento style)
- [ ] Save stories to user profile

**Design Specs:**
- 1080x1920 (Instagram/TikTok story size)
- Gradient backgrounds
- Modern typography
- Smooth animations
- Mobile-first design

**Acceptance Criteria:**
- Stories display correctly on mobile
- Navigation works (tap/swipe)
- Auto-advance can be paused
- Stories can be shared
- Thumbnails generate correctly

---

#### 6. Email Itinerary Export
**Status:** Not Started  
**Assigned:** -  
**Estimated Time:** 3 hours

**Tasks:**
- [ ] Set up Resend account and API key
- [ ] Create email template (HTML)
- [ ] Design email layout:
  - [ ] Header with city image
  - [ ] Day-by-day breakdown
  - [ ] Map previews
  - [ ] Local phrases section
  - [ ] QR code for mobile access
- [ ] Create `/api/itineraries/[id]/email` endpoint
- [ ] Add "Email to me" button on itinerary page
- [ ] Test email rendering across clients
- [ ] Add email sending confirmation

**Email Features:**
- Beautiful responsive design
- Inline images
- Map links
- Calendar export option
- Mobile-friendly

**Acceptance Criteria:**
- Emails send successfully
- Emails render correctly in Gmail, Outlook, Apple Mail
- Links work correctly
- Images load properly

---

### 🟢 Low Priority

#### 7. Interactive Dashboard Map
**Status:** Not Started  
**Assigned:** -  
**Estimated Time:** 4 hours

**Tasks:**
- [ ] Add Mapbox GL JS to dashboard
- [ ] Display user's current location (if permitted)
- [ ] Show nearby spots as markers
- [ ] Cluster markers when zoomed out
- [ ] Add marker click to show spot preview
- [ ] Implement "Explore this area" feature
- [ ] Add map style toggle (light/dark)
- [ ] Optimize map performance

**Acceptance Criteria:**
- Map loads quickly
- Markers are interactive
- Clustering works smoothly
- Mobile performance is good

---

#### 8. Real-time Vibe Check
**Status:** Not Started  
**Assigned:** -  
**Estimated Time:** 5 hours

**Tasks:**
- [ ] Design vibe check data model
- [ ] Create user report submission form
- [ ] Implement vibe aggregation logic
- [ ] Display current vibe on spot page
- [ ] Add vibe history chart
- [ ] Create vibe check notifications
- [ ] Add "Report current vibe" button

**Vibe Metrics:**
- Crowd level (empty → packed)
- Local ratio (% locals vs tourists)
- Instagram activity
- Best time to visit

**Acceptance Criteria:**
- Users can submit vibe reports
- Vibe data aggregates correctly
- Vibe displays on spot pages
- Historical data shows trends

---

## 📋 Backlog

### Features
- [ ] Social features (friends, following)
- [ ] Leaderboards (global, city, friends)
- [ ] Active challenges system
- [ ] Achievement unlocking animations
- [ ] Multi-language support (i18n)
- [ ] Voice input for chat
- [ ] Offline mode (PWA)
- [ ] Push notifications
- [ ] Tourist trap detector AI
- [ ] Trend detection system
- [ ] Public transit integration
- [ ] Walking route optimization

### Technical Improvements
- [ ] Add API rate limiting
- [ ] Implement caching strategy (Redis)
- [ ] Set up Sentry error tracking
- [ ] Add PostHog analytics
- [ ] Create unit tests
- [ ] Create E2E tests
- [ ] Performance optimization
- [ ] Accessibility audit (WCAG 2.1)
- [ ] SEO optimization
- [ ] Bundle size optimization
- [ ] Database query optimization
- [ ] Add database migrations system

### DevOps
- [ ] Set up CI/CD pipeline
- [ ] Configure staging environment
- [ ] Set up database backups
- [ ] Create monitoring dashboard
- [ ] Set up alerting system
- [ ] Document deployment process
- [ ] Create runbook for incidents

---

## ✅ Completed Tasks

### Phase 1-9 (See IMPLEMENTATION_PLAN.md)
- ✅ Project setup and configuration
- ✅ Authentication with Clerk
- ✅ Database schema and RLS policies
- ✅ Core UI components
- ✅ Landing page
- ✅ Chat interface with AI
- ✅ Dashboard with stories
- ✅ Spots listing and detail pages
- ✅ Gamification system
- ✅ Profile page with stats
- ✅ Skeleton loading states

---

## 🐛 Known Bugs

### Critical
- None currently

### High
- None currently

### Medium
- Conversation history doesn't load full conversation (toast notification only)
- Story bubbles are placeholders (no real data)

### Low
- Some pages missing proper error states
- Loading states could be more polished

---

## 📊 Progress Tracking

**Overall Completion:** ~60%

| Phase | Status | Progress |
|-------|--------|----------|
| Foundation | ✅ Complete | 100% |
| Authentication | ✅ Complete | 100% |
| UI Components | ✅ Complete | 100% |
| Landing Page | ✅ Complete | 100% |
| Chat Interface | ✅ Complete | 100% |
| Dashboard | ✅ Complete | 100% |
| Spots Discovery | ✅ Complete | 100% |
| Gamification | ✅ Complete | 100% |
| Itineraries | 🔄 In Progress | 40% |
| API Routes | 🔄 In Progress | 50% |
| Advanced Features | ❌ Not Started | 0% |
| Story Format | ❌ Not Started | 0% |
| Maps & Location | ❌ Not Started | 0% |
| Email & Sharing | ❌ Not Started | 0% |
| Analytics | ❌ Not Started | 0% |
| Testing | ❌ Not Started | 0% |
| Deployment | ❌ Not Started | 0% |

---

## 🎯 Sprint Goals

### Current Sprint (Week 1)
- [ ] Fix all lint errors
- [ ] Seed database with real spot data
- [ ] Implement itinerary generation
- [ ] Add spots search and filters

### Next Sprint (Week 2)
- [ ] Story format itinerary viewer
- [ ] Email export functionality
- [ ] Interactive dashboard map
- [ ] Real-time vibe check

### Sprint 3 (Week 3)
- [ ] Social features
- [ ] Challenges system
- [ ] Multi-language support
- [ ] Analytics integration

---

## 📝 Notes

### Development Environment
- Node.js version: Latest LTS
- Package manager: npm
- Dev server: Next.js Turbopack
- Database: Supabase (PostgreSQL)

### Testing Strategy
- Manual testing for now
- Plan to add automated tests in Sprint 3
- Focus on E2E tests for critical flows

### Deployment Strategy
- Deploy to Vercel
- Use preview deployments for PRs
- Main branch auto-deploys to production
- Staging environment TBD
