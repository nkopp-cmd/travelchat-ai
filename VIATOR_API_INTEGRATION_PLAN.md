# Viator Partner API Integration Plan

**Created:** November 24, 2025  
**Priority:** High  
**Estimated Time:** 8-12 hours  
**Impact:** High - Monetization & Content Enrichment

---

## 🎯 Overview

Integrating the **Viator Partner API** will transform Localley from a discovery app to a **complete travel platform** with booking capabilities, monetization, and access to thousands of tours and activities.

### Benefits:
1. **Monetization** - Earn affiliate commissions (8-12% typical)
2. **Content Enrichment** - Add 300,000+ tours/activities globally
3. **User Value** - One-stop shop for discovery + booking
4. **Revenue Stream** - Passive income from bookings
5. **Competitive Edge** - Full-service travel companion

---

## 📋 Partner Types & Access Levels

### 1. Affiliate (Basic Access)
- **Access:** Content retrieval only
- **Booking:** Redirect to Viator website
- **Commission:** Yes (8-12%)
- **Best For:** Starting out, testing integration

### 2. Affiliate (Full Access)
- **Access:** Comprehensive content
- **Booking:** Redirect to Viator
- **Commission:** Yes (8-12%)
- **Best For:** Content-rich platforms

### 3. Affiliate (Full + Booking Access) ⭐ **RECOMMENDED**
- **Access:** Full content + some booking APIs
- **Booking:** Partial in-app booking
- **Commission:** Yes (8-12%)
- **Best For:** Localley - balance of features and simplicity

### 4. Merchant Partner
- **Access:** Full API access
- **Booking:** Complete in-app booking
- **Commission:** Higher (negotiable)
- **Best For:** Large-scale operations

---

## 🚀 Recommended Approach for Localley

### Phase 1: Affiliate (Full + Booking Access)

**Why This Tier:**
- ✅ Access to full content library
- ✅ Can display pricing and availability
- ✅ Some booking capabilities
- ✅ Easier to get approved
- ✅ Lower technical complexity
- ✅ Still earn commissions

**What You Can Do:**
- Search and display tours/activities
- Show real-time pricing and availability
- Display reviews and ratings
- Show photos and detailed descriptions
- Redirect to Viator for final booking (seamless)
- Track conversions and commissions

---

## 🔧 Technical Implementation Plan

### Step 1: Registration & API Access (1 hour)

**Tasks:**
1. Register for Viator Partner Program
   - Visit: https://www.viator.com/partner-api
   - Fill out application form
   - Specify: Affiliate (Full + Booking Access)
   - Wait for approval (1-3 business days)

2. Obtain API Credentials
   - API Key
   - Partner ID
   - Sandbox credentials for testing

3. Set up environment variables
   ```env
   VIATOR_API_KEY=your_api_key
   VIATOR_PARTNER_ID=your_partner_id
   VIATOR_API_URL=https://api.viator.com/partner
   VIATOR_SANDBOX_URL=https://sandbox.api.viator.com/partner
   ```

---

### Step 2: API Client Setup (2 hours)

**Create:** `lib/viator.ts`

```typescript
// Viator API Client
interface ViatorConfig {
  apiKey: string;
  partnerId: string;
  baseUrl: string;
  sandbox?: boolean;
}

class ViatorClient {
  private config: ViatorConfig;

  constructor(config: ViatorConfig) {
    this.config = config;
  }

  // Search for products (tours/activities)
  async searchProducts(params: {
    destination: string;
    startDate?: string;
    endDate?: string;
    categoryId?: string;
    currency?: string;
  }) {
    // Implementation
  }

  // Get product details
  async getProduct(productCode: string) {
    // Implementation
  }

  // Check availability
  async checkAvailability(productCode: string, date: string) {
    // Implementation
  }

  // Get pricing
  async getPricing(productCode: string, date: string, travelers: number) {
    // Implementation
  }

  // Get reviews
  async getReviews(productCode: string) {
    // Implementation
  }
}
```

---

### Step 3: Database Schema Updates (1 hour)

**Add to Supabase:**

```sql
-- Viator activities table
CREATE TABLE viator_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_code TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  destination TEXT NOT NULL,
  category TEXT,
  duration TEXT,
  price_from DECIMAL(10,2),
  currency TEXT DEFAULT 'USD',
  rating DECIMAL(3,2),
  review_count INTEGER,
  images TEXT[],
  booking_url TEXT,
  viator_url TEXT,
  last_synced TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Link activities to our spots
CREATE TABLE spot_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  spot_id UUID REFERENCES spots(id) ON DELETE CASCADE,
  activity_id UUID REFERENCES viator_activities(id) ON DELETE CASCADE,
  relevance_score DECIMAL(3,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(spot_id, activity_id)
);

-- Track bookings for commission
CREATE TABLE viator_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  activity_id UUID REFERENCES viator_activities(id),
  product_code TEXT NOT NULL,
  booking_reference TEXT,
  status TEXT DEFAULT 'pending',
  amount DECIMAL(10,2),
  currency TEXT,
  commission DECIMAL(10,2),
  booked_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_viator_activities_destination ON viator_activities(destination);
CREATE INDEX idx_viator_activities_category ON viator_activities(category);
CREATE INDEX idx_spot_activities_spot_id ON spot_activities(spot_id);
CREATE INDEX idx_viator_bookings_user_id ON viator_bookings(user_id);
```

---

### Step 4: API Routes (3 hours)

**Create API endpoints:**

#### 1. Search Activities
**File:** `app/api/viator/search/route.ts`

```typescript
// Search for activities by destination
POST /api/viator/search
{
  "destination": "Seoul",
  "startDate": "2025-12-01",
  "category": "food-tours"
}
```

#### 2. Get Activity Details
**File:** `app/api/viator/activity/[productCode]/route.ts`

```typescript
// Get detailed activity information
GET /api/viator/activity/12345
```

#### 3. Check Availability
**File:** `app/api/viator/availability/route.ts`

```typescript
// Check real-time availability
POST /api/viator/availability
{
  "productCode": "12345",
  "date": "2025-12-01"
}
```

#### 4. Get Pricing
**File:** `app/api/viator/pricing/route.ts`

```typescript
// Get pricing for specific date and travelers
POST /api/viator/pricing
{
  "productCode": "12345",
  "date": "2025-12-01",
  "travelers": 2
}
```

---

### Step 5: UI Components (4 hours)

#### 1. Activity Card Component
**File:** `components/viator/activity-card.tsx`

**Features:**
- Activity image
- Title and description
- Duration
- Price (from $XX)
- Rating and review count
- "View Details" button
- "Book Now" button (redirect to Viator)

#### 2. Activity Detail Modal
**File:** `components/viator/activity-detail-modal.tsx`

**Features:**
- Full description
- Photo gallery
- Pricing details
- Availability calendar
- Reviews section
- Booking button
- Share button

#### 3. Activities Section for Spot Pages
**File:** `components/spots/spot-activities.tsx`

**Features:**
- "Things to Do Nearby" section
- Grid of related activities
- Filter by category
- Sort by price/rating

---

### Step 6: Integration with Existing Features (2 hours)

#### 1. Spot Detail Pages
**Update:** `app/spots/[id]/page.tsx`

Add "Activities Nearby" section:
```tsx
<SpotActivities spotId={spot.id} city={spot.city} />
```

#### 2. Itinerary Generation
**Update:** `app/api/itineraries/generate/route.ts`

Include Viator activities in AI prompt:
```typescript
// Fetch relevant activities from Viator
const activities = await viator.searchProducts({
  destination: city,
  startDate: startDate
});

// Include in OpenAI prompt
const prompt = `
...
Available activities from Viator:
${activities.map(a => `- ${a.title} ($${a.price})`).join('\n')}
...
`;
```

#### 3. Dashboard
**Update:** `app/dashboard/page.tsx`

Add "Recommended Activities" section based on user's location or interests.

---

## 💰 Monetization Strategy

### Commission Structure
- **Standard Rate:** 8-12% of booking value
- **Payment:** Monthly via wire transfer or PayPal
- **Minimum Payout:** $100-$500 (varies)
- **Tracking:** Via unique partner links

### Revenue Projections
**Conservative Estimate:**
- 1,000 monthly active users
- 5% booking conversion rate = 50 bookings/month
- Average booking value: $100
- Commission rate: 10%
- **Monthly Revenue:** $500
- **Annual Revenue:** $6,000

**Optimistic Estimate:**
- 10,000 monthly active users
- 10% booking conversion rate = 1,000 bookings/month
- Average booking value: $150
- Commission rate: 12%
- **Monthly Revenue:** $18,000
- **Annual Revenue:** $216,000

---

## 🎨 UX/UI Recommendations

### 1. Seamless Integration
- Activities feel native to Localley
- Consistent design language
- Clear "Powered by Viator" badge

### 2. Trust Signals
- Display Viator ratings and reviews
- Show "Verified by Viator" badge
- Include cancellation policies

### 3. Booking Flow
- One-click to Viator (opens in new tab)
- Pre-fill user details if possible
- Track conversion with UTM parameters

### 4. Discovery
- "Activities Near This Spot" on spot pages
- "Recommended Activities" on dashboard
- "Add Activities" in itinerary generator

---

## 📊 Success Metrics

### Track These KPIs:
1. **Click-Through Rate (CTR)** - Activity card clicks
2. **Conversion Rate** - Bookings / Clicks
3. **Average Booking Value** - Revenue per booking
4. **Commission Earned** - Monthly/annual revenue
5. **User Engagement** - Time spent on activity pages

### Goals (First 3 Months):
- 100+ activity page views/week
- 5%+ click-through rate
- 2%+ booking conversion rate
- $500+ monthly commission

---

## 🚧 Implementation Timeline

### Week 1: Setup & API Integration
- [ ] Register for Viator Partner Program
- [ ] Obtain API credentials
- [ ] Set up Viator API client
- [ ] Create database schema
- [ ] Build API routes

### Week 2: UI Components
- [ ] Create activity card component
- [ ] Build activity detail modal
- [ ] Design activities section
- [ ] Implement search/filter UI

### Week 3: Integration
- [ ] Add activities to spot pages
- [ ] Integrate with itinerary generator
- [ ] Add dashboard recommendations
- [ ] Implement tracking

### Week 4: Testing & Launch
- [ ] Test all API endpoints
- [ ] Verify booking flow
- [ ] Check commission tracking
- [ ] Soft launch to beta users
- [ ] Monitor metrics

---

## ⚠️ Important Considerations

### 1. API Rate Limits
- Check Viator's rate limits
- Implement caching (Redis recommended)
- Cache product data for 24 hours
- Cache availability for 1 hour

### 2. Data Freshness
- Sync popular activities daily
- Update pricing/availability in real-time
- Handle sold-out scenarios gracefully

### 3. Error Handling
- Viator API downtime
- Product no longer available
- Pricing changes
- Booking failures

### 4. Legal/Compliance
- Display Viator's terms and conditions
- Include proper attribution
- Follow partner agreement guidelines
- Handle user data properly

### 5. Performance
- Lazy load activity images
- Paginate activity lists
- Use CDN for Viator images
- Optimize API calls

---

## 🔄 Alternative: GetYourGuide API

If Viator approval is slow or denied, consider **GetYourGuide** as an alternative:

**Pros:**
- Similar API structure
- Good commission rates (10-15%)
- Easier approval process
- Strong presence in Asia

**Cons:**
- Smaller inventory than Viator
- Less brand recognition

---

## 📝 Next Steps

### Immediate Actions:
1. **Apply for Viator Partner Program** (today)
2. **Review API documentation** (while waiting for approval)
3. **Design UI mockups** (get user feedback)
4. **Plan database schema** (prepare for integration)

### After Approval:
1. **Set up sandbox environment** (test API)
2. **Build API client** (lib/viator.ts)
3. **Create database tables** (Supabase)
4. **Develop UI components** (activity cards)
5. **Integrate with existing features** (spots, itineraries)
6. **Test thoroughly** (sandbox → production)
7. **Launch to beta users** (gather feedback)
8. **Monitor metrics** (optimize conversion)

---

## 💡 Pro Tips

1. **Start Small** - Integrate on spot pages first, then expand
2. **Cache Aggressively** - Reduce API calls, improve performance
3. **Track Everything** - Use UTM parameters for attribution
4. **A/B Test** - Test different placements and CTAs
5. **User Feedback** - Ask users if they find activities helpful
6. **Seasonal Content** - Promote relevant activities by season
7. **Personalization** - Recommend based on user interests

---

## 🎯 Success Criteria

### Must Have:
- ✅ Viator API integration working
- ✅ Activities display on spot pages
- ✅ Booking redirects to Viator
- ✅ Commission tracking implemented

### Nice to Have:
- ✅ Activities in itinerary generator
- ✅ Dashboard recommendations
- ✅ Search/filter functionality
- ✅ User reviews integration

### Future Enhancements:
- 🔮 In-app booking (Merchant tier)
- 🔮 Price comparison with competitors
- 🔮 Bundle deals (spot + activity)
- 🔮 Loyalty rewards program

---

## 📞 Resources

### Official Documentation:
- **Viator Partner API Docs:** https://docs.viator.com/partner-api/
- **Technical Guide:** https://docs.viator.com/partner-api/technical/
- **Postman Collection:** Available after approval

### Support:
- **Partner Support:** partnersupport@viator.com
- **Technical Support:** Available through partner portal
- **Community:** Viator Partner Forum

---

**Estimated Total Time:** 8-12 hours  
**Estimated Revenue (Year 1):** $6,000 - $50,000  
**ROI:** High - Passive income stream  
**Priority:** High - Adds significant value

---

**Created:** November 24, 2025  
**Status:** Ready to implement  
**Next Action:** Apply for Viator Partner Program
