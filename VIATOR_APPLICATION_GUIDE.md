# Viator Partner Program Application Guide

**Created:** November 25, 2025  
**Priority:** High  
**Estimated Time:** 30 minutes (application) + 1-3 days (approval)  
**Status:** Ready to Apply

---

## 🎯 Quick Start Guide

### Step 1: Prepare Your Application (10 minutes)

Before applying, gather this information:

**Company/Project Details:**
- **Project Name:** Localley
- **Website:** [Your domain or staging URL]
- **Description:** AI-powered travel companion helping travelers discover authentic local experiences and hidden gems
- **Target Audience:** Independent travelers seeking authentic, local experiences
- **Monthly Traffic:** [Current or projected]
- **Business Model:** Affiliate commissions from activity bookings

**Technical Details:**
- **Platform:** Next.js web application
- **Integration Type:** Affiliate (Full + Booking Access)
- **Use Case:** Display activities near curated local spots
- **Expected Volume:** [Estimate based on user projections]

---

## 📝 Application Process

### Option 1: Viator Partner Program (Recommended)

**URL:** https://www.viator.com/partner-api

**Steps:**
1. Visit the partner portal
2. Click "Apply Now" or "Become a Partner"
3. Fill out the application form
4. Select partnership type: **Affiliate (Full + Booking Access)**
5. Provide business details
6. Submit application
7. Wait for approval (1-3 business days typically)

**What to Emphasize:**
- ✅ AI-powered personalization
- ✅ Focus on authentic local experiences
- ✅ 50+ curated spots already in database
- ✅ Growing user base
- ✅ Professional integration already built
- ✅ Ready to drive bookings

---

### Option 2: Viator Affiliate Network

**URL:** https://www.viator.com/affiliates

**Alternative if main program is slow:**
- Simpler approval process
- Basic affiliate links
- Lower technical requirements
- Still earn commissions
- Can upgrade later

---

## 🔧 After Approval

### Step 1: Get Your Credentials

Once approved, you'll receive:
- **API Key** - For authentication
- **Partner ID** - Your unique identifier
- **Sandbox Credentials** - For testing
- **Documentation Access** - Full API docs

### Step 2: Configure Environment Variables

Add to your `.env.local`:

```env
# Viator API Configuration
VIATOR_API_KEY=your_api_key_here
VIATOR_PARTNER_ID=your_partner_id_here
VIATOR_API_URL=https://api.viator.com/partner
VIATOR_SANDBOX_URL=https://sandbox.api.viator.com/partner

# Optional: Use sandbox for testing
VIATOR_USE_SANDBOX=false
```

### Step 3: Test the Integration

```bash
# The app will automatically detect the API key
# and switch from mock data to real data

# Start the dev server
npm run dev

# Visit a spot page
# You should see real Viator activities instead of mock data
```

### Step 4: Verify Real Data

**Test Checklist:**
- [ ] Visit `/spots/[any-spot-id]`
- [ ] Scroll to "Things to Do Nearby" section
- [ ] Verify activities are real (not mock data)
- [ ] Check pricing is accurate
- [ ] Test "Book Now" button (should open Viator)
- [ ] Verify commission tracking works

---

## 💰 Commission Tracking

### How It Works

1. **User clicks "Book Now"** on an activity
2. **Redirects to Viator** with your partner ID
3. **User completes booking** on Viator
4. **You earn commission** (8-12% typically)
5. **Monthly payout** from Viator

### Tracking Setup

The tracking is already implemented in `components/viator/activity-card.tsx`:

```typescript
const handleBookNow = () => {
    // Analytics tracking
    if (typeof window !== 'undefined' && (window as any).gtag) {
        (window as any).gtag('event', 'viator_click', {
            product_code: activity.productCode,
            title: activity.title,
            price: activity.priceFrom,
        });
    }

    // Opens Viator with your partner ID
    window.open(activity.bookingUrl, '_blank', 'noopener,noreferrer');
};
```

### Monitor Performance

**Viator Partner Dashboard:**
- Track clicks
- Monitor conversions
- View commission earnings
- Download reports
- Optimize performance

---

## 🎨 Current Integration Status

### ✅ Already Implemented

1. **API Client** (`lib/viator.ts`)
   - Full client with mock data fallback
   - Automatic detection of API key
   - Error handling and retries

2. **Type Definitions** (`types/viator.ts`)
   - Complete TypeScript types
   - Activity, search, pricing interfaces

3. **API Routes** (`app/api/viator/search/route.ts`)
   - Search endpoint ready
   - Supports GET and POST
   - Proper error handling

4. **UI Components**
   - `ActivityCard` - Beautiful activity cards
   - `SpotActivities` - Activities section for spots
   - Loading states and skeletons
   - Responsive design

5. **Integration Points**
   - Spot detail pages show nearby activities
   - Mock data works perfectly
   - Ready to switch to real data

### 🔄 What Changes When You Add API Key

**Before (Mock Data):**
```
🎭 Viator Client: Using mock data (API key not configured)
```

**After (Real Data):**
```
✅ Viator Client: Connected to Viator API
```

**No code changes needed!** Just add the environment variables.

---

## 📊 Expected Results

### With Real API Access

**Activities Per City:**
- Seoul: 500+ activities
- Tokyo: 800+ activities
- Bangkok: 600+ activities
- Singapore: 400+ activities

**Data Quality:**
- Real-time pricing
- Accurate availability
- Actual reviews and ratings
- Professional photos
- Detailed descriptions

**User Experience:**
- Browse real activities
- See current prices
- Check availability
- Book directly through Viator
- Earn commissions automatically

---

## 🚀 Revenue Projections

### Conservative Estimate

**Assumptions:**
- 1,000 monthly active users
- 10% view activities
- 5% click "Book Now"
- 2% complete booking
- Average booking: $100
- Commission rate: 10%

**Monthly Revenue:**
- 1,000 users × 10% = 100 activity views
- 100 views × 5% = 5 clicks
- 5 clicks × 40% conversion = 2 bookings
- 2 bookings × $100 × 10% = **$20/month**

### Optimistic Estimate

**Assumptions:**
- 10,000 monthly active users
- 20% view activities
- 10% click "Book Now"
- 5% complete booking
- Average booking: $150
- Commission rate: 12%

**Monthly Revenue:**
- 10,000 users × 20% = 2,000 activity views
- 2,000 views × 10% = 200 clicks
- 200 clicks × 50% conversion = 100 bookings
- 100 bookings × $150 × 12% = **$1,800/month**

**Annual:** $21,600

---

## 🎯 Optimization Tips

### Increase Conversion Rate

1. **Strategic Placement**
   - Show activities on spot pages
   - Include in itineraries
   - Feature in chat responses

2. **Personalization**
   - Match activities to user interests
   - Filter by budget
   - Recommend based on Localley score

3. **Trust Signals**
   - Display Viator ratings
   - Show review counts
   - Highlight "Instant Confirmation"
   - Include cancellation policies

4. **Compelling CTAs**
   - "Book Now" buttons prominent
   - Show pricing clearly
   - Highlight limited availability
   - Use urgency when appropriate

---

## 📝 Application Template

### Email Template (If Needed)

```
Subject: Partnership Application - Localley Travel Platform

Dear Viator Partner Team,

I'm writing to apply for the Viator Partner Program for Localley, 
an AI-powered travel companion focused on authentic local experiences.

About Localley:
- Platform: Next.js web application
- Focus: Curated local spots and hidden gems
- Target: Independent travelers seeking authentic experiences
- Current Status: 50+ curated spots, AI itinerary generation
- Integration: Already built and ready for API connection

We're seeking Affiliate (Full + Booking Access) partnership to:
- Display relevant activities near our curated spots
- Provide users with seamless booking options
- Drive qualified bookings through personalized recommendations

Our integration is already built with:
- Professional UI components
- Proper error handling
- Commission tracking
- Analytics integration

We're ready to start driving bookings immediately upon approval.

Thank you for considering our application.

Best regards,
[Your Name]
[Your Email]
[Your Website]
```

---

## ⚠️ Important Notes

### API Rate Limits

**Typical Limits:**
- 100 requests/minute (basic)
- 1,000 requests/minute (full access)
- Unlimited for cached data

**Our Approach:**
- Cache activity data for 24 hours
- Cache search results for 1 hour
- Lazy load images
- Implement request throttling

### Data Freshness

**Update Strategy:**
- **Activities:** Sync daily
- **Pricing:** Real-time on demand
- **Availability:** Real-time on demand
- **Reviews:** Sync weekly

### Compliance

**Must Follow:**
- Display Viator branding
- Include "Powered by Viator" badge
- Link to Viator terms
- Proper attribution
- No price manipulation
- Accurate availability display

---

## 🔄 Alternative: GetYourGuide

If Viator approval is slow or denied:

**GetYourGuide Partner Program:**
- URL: https://partner.getyourguide.com
- Similar API structure
- Good commission rates (10-15%)
- Easier approval process
- Strong presence in Asia

**Our code is flexible** - can support multiple providers with minimal changes.

---

## 📞 Next Steps

### Immediate Actions

1. **Apply for Viator Partner Program** (30 min)
   - Visit partner portal
   - Fill out application
   - Submit for review

2. **Prepare Staging Environment** (15 min)
   - Deploy to staging if not already
   - Get staging URL for application
   - Prepare screenshots

3. **Monitor Application** (1-3 days)
   - Check email for approval
   - Respond to any questions
   - Prepare for onboarding

### After Approval

4. **Configure API Credentials** (5 min)
   - Add to `.env.local`
   - Test in development
   - Verify real data loads

5. **Test Integration** (30 min)
   - Test all activity features
   - Verify booking flow
   - Check commission tracking
   - Test error handling

6. **Deploy to Production** (15 min)
   - Add credentials to production env
   - Deploy updated app
   - Monitor for issues

7. **Monitor Performance** (Ongoing)
   - Track clicks and conversions
   - Optimize placement
   - A/B test CTAs
   - Analyze revenue

---

## 🎉 Success Criteria

### Integration Complete When:

- [ ] Viator Partner Program approved
- [ ] API credentials obtained
- [ ] Environment variables configured
- [ ] Real activities displaying
- [ ] Booking flow working
- [ ] Commission tracking verified
- [ ] No console errors
- [ ] Performance acceptable
- [ ] User experience smooth

### Revenue Generating When:

- [ ] First booking completed
- [ ] Commission tracked
- [ ] Payment received
- [ ] Conversion rate \u003e 2%
- [ ] Monthly revenue \u003e $100

---

## 📚 Resources

### Official Documentation
- **Viator Partner Portal:** https://www.viator.com/partner-api
- **API Documentation:** Provided after approval
- **Support:** partnersupport@viator.com

### Our Implementation
- **API Client:** `lib/viator.ts`
- **Types:** `types/viator.ts`
- **Components:** `components/viator/`
- **Integration Plan:** `VIATOR_API_INTEGRATION_PLAN.md`

---

**Status:** ⏳ **Ready to Apply**  
**Next Action:** Apply for Viator Partner Program  
**Estimated Approval:** 1-3 business days  
**Impact:** High - Enables monetization  

**Apply Now:** https://www.viator.com/partner-api

---

**Document Created:** November 25, 2025  
**Last Updated:** November 25, 2025  
**Priority:** High  
**Owner:** Development Team
