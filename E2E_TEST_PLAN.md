# End-to-End Testing Plan

**Date:** 2025-11-27
**Status:** In Progress
**Purpose:** Comprehensive testing before production deployment

---

## 🎯 Testing Strategy

### Objectives
1. Verify all user flows work end-to-end
2. Test all major features thoroughly
3. Identify and fix bugs
4. Ensure cross-browser compatibility
5. Validate SEO implementation
6. Check mobile responsiveness
7. Verify performance benchmarks

### Test Environments
- **Local Development:** http://localhost:3000
- **Browsers:** Chrome, Firefox, Safari, Edge
- **Devices:** Desktop, Tablet, Mobile (responsive mode)
- **User States:** Unauthenticated, Authenticated

---

## 📝 Test Cases

### 1. User Authentication Flow

#### 1.1 Sign Up Flow
- [ ] Navigate to homepage
- [ ] Click "Sign Up" button
- [ ] Verify Clerk sign-up form appears
- [ ] Complete sign-up process
- [ ] Verify redirect to dashboard
- [ ] Verify user is authenticated

**Expected Result:** User successfully signs up and lands on dashboard

#### 1.2 Sign In Flow
- [ ] Navigate to homepage when logged out
- [ ] Click "Sign In" button
- [ ] Enter credentials
- [ ] Verify redirect to dashboard
- [ ] Verify authentication persists on reload

**Expected Result:** User successfully signs in and stays authenticated

#### 1.3 Sign Out Flow
- [ ] Click user menu/profile
- [ ] Click "Sign Out"
- [ ] Verify redirect to homepage
- [ ] Verify protected routes redirect to sign-in

**Expected Result:** User successfully signs out

---

### 2. Itinerary Generation (Standard Flow)

#### 2.1 Create New Itinerary
- [ ] Navigate to dashboard
- [ ] Click "Generate Itinerary"
- [ ] Navigate to `/itineraries/new`
- [ ] Fill out form:
  - [ ] City: "Seoul"
  - [ ] Days: 3
  - [ ] Interests: Food, Culture
  - [ ] Budget: Moderate
  - [ ] Pace: Moderate
- [ ] Click "Generate"
- [ ] Verify loading state appears
- [ ] Wait for generation (30-60 seconds)
- [ ] Verify itinerary appears with:
  - [ ] Title
  - [ ] City
  - [ ] Days
  - [ ] Highlights
  - [ ] Daily activities
  - [ ] Cost estimate

**Expected Result:** Complete itinerary generated successfully

#### 2.2 Save Generated Itinerary
- [ ] After generation, verify "Save" button appears
- [ ] Click "Save Itinerary"
- [ ] Verify success message
- [ ] Navigate to itineraries list
- [ ] Verify saved itinerary appears

**Expected Result:** Itinerary saved to database and appears in list

---

### 3. Template-Based Generation

#### 3.1 Browse Templates
- [ ] Navigate to dashboard
- [ ] Click "Browse Templates"
- [ ] Navigate to `/templates`
- [ ] Verify all 8 templates display:
  - [ ] Weekend Getaway 🌴
  - [ ] Week-Long Adventure 🗺️
  - [ ] Business + Leisure 💼
  - [ ] Foodie Tour 🍜
  - [ ] Cultural Deep Dive 🏛️
  - [ ] Family Adventure 👨‍👩‍👧‍👦
  - [ ] Romantic Getaway ❤️
  - [ ] Local's Guide 🗝️
- [ ] Verify template cards show:
  - [ ] Name and description
  - [ ] Days and pace
  - [ ] Focus areas
  - [ ] Target audience

**Expected Result:** Template gallery displays correctly

#### 3.2 Use Template - Foodie Tour
- [ ] Click "Use Template" on Foodie Tour
- [ ] Verify redirect to `/dashboard?template=foodie-tour`
- [ ] Verify chat greeting mentions template
- [ ] Type city: "Tokyo"
- [ ] Send message
- [ ] Verify AI generates foodie-focused itinerary:
  - [ ] 4 days (template default)
  - [ ] 5 activities per day
  - [ ] 80%+ food activities
  - [ ] Restaurants, markets, street food
- [ ] Verify generation completes
- [ ] Save itinerary

**Expected Result:** Foodie template generates appropriate itinerary

#### 3.3 Use Template - Weekend Getaway
- [ ] Select Weekend Getaway template
- [ ] Provide city: "Bangkok"
- [ ] Verify generates:
  - [ ] 2 days
  - [ ] 3 activities per day
  - [ ] Relaxed pace
  - [ ] Leisure activities

**Expected Result:** Weekend template generates correctly

#### 3.4 Use Template - Cultural Deep Dive
- [ ] Select Cultural Deep Dive template
- [ ] Provide city: "Seoul"
- [ ] Verify generates:
  - [ ] 5 days
  - [ ] 4 activities per day
  - [ ] Museums, historical sites
  - [ ] Traditional experiences

**Expected Result:** Cultural template generates correctly

---

### 4. Itinerary Editing

#### 4.1 Access Edit Mode
- [ ] Navigate to saved itinerary
- [ ] Click "Edit" button
- [ ] Navigate to `/itineraries/{id}/edit`
- [ ] Verify edit interface loads:
  - [ ] Title field
  - [ ] City field
  - [ ] Days displayed
  - [ ] All activities shown

**Expected Result:** Edit page loads with all data

#### 4.2 Edit Title and City
- [ ] Click title field
- [ ] Change title to "Updated Seoul Adventure"
- [ ] Change city to "Seoul, South Korea"
- [ ] Wait for auto-save (30 seconds) OR click Save
- [ ] Verify "Saved" indicator appears
- [ ] Refresh page
- [ ] Verify changes persisted

**Expected Result:** Title and city changes save correctly

#### 4.3 Drag and Drop Activities
- [ ] Find Day 1
- [ ] Grab drag handle on first activity
- [ ] Drag to third position
- [ ] Drop activity
- [ ] Verify order changes
- [ ] Verify auto-save triggers
- [ ] Refresh page
- [ ] Verify new order persisted

**Expected Result:** Drag and drop works and persists

#### 4.4 Edit Activity Details
- [ ] Click "Edit" on an activity
- [ ] Change name to "New Spot Name"
- [ ] Change time to "2:00 PM"
- [ ] Change description
- [ ] Click "Save"
- [ ] Verify changes appear
- [ ] Wait for auto-save
- [ ] Refresh page
- [ ] Verify changes persisted

**Expected Result:** Activity edits save correctly

#### 4.5 Add New Activity
- [ ] Scroll to a day
- [ ] Click "Add Activity"
- [ ] Fill in activity details:
  - [ ] Name
  - [ ] Time
  - [ ] Description
  - [ ] Cost
- [ ] Click "Save" or submit
- [ ] Verify activity appears in list
- [ ] Verify auto-save triggers
- [ ] Refresh page
- [ ] Verify new activity persisted

**Expected Result:** New activities can be added

#### 4.6 Duplicate Activity
- [ ] Find an activity
- [ ] Click "Duplicate" button
- [ ] Verify copy appears below original
- [ ] Verify auto-save triggers
- [ ] Edit duplicated activity
- [ ] Verify changes only affect copy

**Expected Result:** Activities can be duplicated

#### 4.7 Delete Activity
- [ ] Find an activity
- [ ] Click "Delete" button
- [ ] Verify confirmation dialog (if present)
- [ ] Confirm deletion
- [ ] Verify activity removed
- [ ] Verify auto-save triggers
- [ ] Refresh page
- [ ] Verify deletion persisted

**Expected Result:** Activities can be deleted

#### 4.8 Edit Day Theme and Tips
- [ ] Expand a day
- [ ] Click edit on day theme
- [ ] Change theme
- [ ] Edit local tip
- [ ] Edit transport tip
- [ ] Save changes
- [ ] Verify auto-save
- [ ] Refresh and verify persistence

**Expected Result:** Day-level edits save correctly

---

### 5. Itinerary Revision (Chat)

#### 5.1 Access Revision
- [ ] On itinerary detail page
- [ ] Click "Revise with Alley"
- [ ] Navigate to `/dashboard?itinerary={id}&title=...`
- [ ] Verify chat loads with context
- [ ] Verify greeting mentions itinerary title

**Expected Result:** Revision mode loads correctly

#### 5.2 Request Changes
- [ ] Type: "Add more food activities to Day 2"
- [ ] Send message
- [ ] Verify AI responds
- [ ] Verify suggestions provided
- [ ] Request another change
- [ ] Verify conversation continues

**Expected Result:** Chat-based revision works

---

### 6. Itinerary Sharing

#### 6.1 Generate Share Link
- [ ] On itinerary detail page
- [ ] Click "Share" button
- [ ] Verify share dialog opens
- [ ] Click "Generate Share Link" (if needed)
- [ ] Verify share code created
- [ ] Verify share URL displayed
- [ ] Copy share URL

**Expected Result:** Share link generated

#### 6.2 Access Shared Itinerary
- [ ] Open share URL in incognito/private window
- [ ] Navigate to `/shared/{shareCode}`
- [ ] Verify itinerary displays publicly
- [ ] Verify no edit/delete buttons
- [ ] Verify all content visible

**Expected Result:** Shared itinerary accessible publicly

---

### 7. Itinerary Export

#### 7.1 Export to PDF
- [ ] On itinerary detail page
- [ ] Click "Download PDF" button
- [ ] Verify PDF generation starts
- [ ] Wait for download
- [ ] Open PDF file
- [ ] Verify contains:
  - [ ] Title and city
  - [ ] All days and activities
  - [ ] Proper formatting
  - [ ] Readable text

**Expected Result:** PDF exports correctly

---

### 8. Spot Discovery

#### 8.1 Browse All Spots
- [ ] Navigate to dashboard
- [ ] Click "Browse Spots"
- [ ] Navigate to `/spots`
- [ ] Verify spots page loads
- [ ] Verify spots display in grid
- [ ] Verify spot cards show:
  - [ ] Name
  - [ ] Category
  - [ ] Localley score
  - [ ] Image
  - [ ] Address

**Expected Result:** Spots page displays correctly

#### 8.2 Search Spots
- [ ] On spots page
- [ ] Type "coffee" in search box
- [ ] Verify results filter in real-time
- [ ] Verify only relevant spots show
- [ ] Clear search
- [ ] Verify all spots return

**Expected Result:** Search filters spots correctly

#### 8.3 Filter by Category
- [ ] Click Category filter
- [ ] Select "Food"
- [ ] Verify only food spots show
- [ ] Verify results count updates
- [ ] Select "Cafe"
- [ ] Verify only cafes show

**Expected Result:** Category filter works

#### 8.4 Filter by City
- [ ] Click City filter
- [ ] Select "Seoul"
- [ ] Verify only Seoul spots show
- [ ] Change to "Tokyo"
- [ ] Verify Tokyo spots show

**Expected Result:** City filter works

#### 8.5 Filter by Localley Score
- [ ] Click Score filter
- [ ] Select "6 - Legendary"
- [ ] Verify only 6-score spots show
- [ ] Select "5 - Hidden Gem"
- [ ] Verify only 5-score spots show

**Expected Result:** Score filter works

#### 8.6 Combined Filters
- [ ] Select Category: "Food"
- [ ] Select City: "Seoul"
- [ ] Select Score: "5 - Hidden Gem"
- [ ] Verify results match all criteria
- [ ] Verify active filters display as badges
- [ ] Click X on a badge
- [ ] Verify that filter removed

**Expected Result:** Multiple filters work together

#### 8.7 Sort Options
- [ ] Select "Highest Score" sort
- [ ] Verify spots sorted by score descending
- [ ] Select "Trending" sort
- [ ] Verify trending spots appear first
- [ ] Select "Most Local" sort
- [ ] Verify sorted by local percentage

**Expected Result:** Sorting works correctly

#### 8.8 Clear All Filters
- [ ] Apply multiple filters
- [ ] Click "Clear all filters"
- [ ] Verify all filters reset
- [ ] Verify all spots display again

**Expected Result:** Clear filters works

#### 8.9 Empty State
- [ ] Apply filters with no matches
- [ ] Verify empty state displays
- [ ] Verify message suggests adjusting filters
- [ ] Verify "Clear all filters" button present

**Expected Result:** Empty state shows correctly

---

### 9. Spot Detail Page

#### 9.1 View Spot Details
- [ ] Click on a spot card
- [ ] Navigate to `/spots/{id}`
- [ ] Verify spot page loads with:
  - [ ] Name
  - [ ] Hero image
  - [ ] Description
  - [ ] Category badges
  - [ ] Localley score
  - [ ] Address
  - [ ] Best time to visit
  - [ ] Tips
  - [ ] Map (if applicable)

**Expected Result:** Spot details display correctly

#### 9.2 View Photos
- [ ] Verify hero image displays
- [ ] If multiple photos, verify gallery
- [ ] Click images to view larger
- [ ] Verify images load properly

**Expected Result:** Photos display correctly

#### 9.3 Back Navigation
- [ ] Click "Back to Explore" button
- [ ] Verify returns to spots list
- [ ] Verify filters maintained (if any)

**Expected Result:** Back navigation works

---

### 10. Dashboard

#### 10.1 View Dashboard
- [ ] Navigate to `/dashboard`
- [ ] Verify sections display:
  - [ ] Quick actions card
  - [ ] Recent itineraries (if any)
  - [ ] Chat interface

**Expected Result:** Dashboard loads correctly

#### 10.2 Quick Actions
- [ ] Verify buttons present:
  - [ ] Generate Itinerary
  - [ ] Browse Templates
  - [ ] Browse Spots
- [ ] Click each button
- [ ] Verify correct navigation

**Expected Result:** All quick actions work

#### 10.3 Recent Itineraries
- [ ] If user has itineraries, verify they display
- [ ] Click on a recent itinerary
- [ ] Verify navigates to detail page
- [ ] Click "View All Itineraries"
- [ ] Verify navigates to itineraries list

**Expected Result:** Recent itineraries work

---

### 11. SEO & Meta Tags

#### 11.1 Itinerary Meta Tags
- [ ] Navigate to an itinerary page
- [ ] View page source (Ctrl+U)
- [ ] Verify meta tags present:
  - [ ] `<title>` with itinerary title
  - [ ] `<meta name="description">`
  - [ ] `<meta property="og:title">`
  - [ ] `<meta property="og:description">`
  - [ ] `<meta property="og:image">`
  - [ ] `<meta name="twitter:card">`
- [ ] Verify OG image URL contains parameters

**Expected Result:** All meta tags present and correct

#### 11.2 Spot Meta Tags
- [ ] Navigate to a spot page
- [ ] View page source
- [ ] Verify meta tags present with spot data
- [ ] Verify score label in title

**Expected Result:** Spot meta tags correct

#### 11.3 JSON-LD Structured Data
- [ ] On itinerary page, view source
- [ ] Find `<script type="application/ld+json">`
- [ ] Verify JSON structure:
  - [ ] @type: "TouristTrip"
  - [ ] name, description present
  - [ ] itinerary array present
- [ ] Copy JSON
- [ ] Validate at schema.org validator

**Expected Result:** Valid structured data

#### 11.4 Open Graph Image
- [ ] Copy OG image URL from meta tag
- [ ] Open in new tab
- [ ] Verify image generates
- [ ] Verify shows itinerary title and city
- [ ] Verify 1200x630 dimensions
- [ ] Verify Localley branding

**Expected Result:** OG image renders correctly

#### 11.5 Social Sharing Preview
- [ ] Use Facebook Sharing Debugger
- [ ] Paste itinerary URL
- [ ] Verify preview shows:
  - [ ] Title
  - [ ] Description
  - [ ] OG image
- [ ] Try Twitter Card Validator
- [ ] Verify Twitter preview

**Expected Result:** Social previews display correctly

#### 11.6 Sitemap
- [ ] Navigate to `/sitemap.xml`
- [ ] Verify XML loads
- [ ] Verify contains:
  - [ ] Static routes
  - [ ] Spot routes
  - [ ] Shared itinerary routes
- [ ] Verify proper XML format

**Expected Result:** Sitemap generates correctly

#### 11.7 Robots.txt
- [ ] Navigate to `/robots.txt`
- [ ] Verify rules present:
  - [ ] Allow: /
  - [ ] Disallow private routes
  - [ ] Sitemap URL
- [ ] Verify format correct

**Expected Result:** Robots.txt correct

---

### 12. Error Handling

#### 12.1 404 Not Found
- [ ] Navigate to `/invalid-page`
- [ ] Verify 404 page displays
- [ ] Verify can navigate back

**Expected Result:** 404 page works

#### 12.2 Invalid Itinerary ID
- [ ] Navigate to `/itineraries/invalid-id`
- [ ] Verify error handling
- [ ] Verify redirects or shows error

**Expected Result:** Handles invalid IDs gracefully

#### 12.3 Invalid Spot ID
- [ ] Navigate to `/spots/invalid-id`
- [ ] Verify error handling

**Expected Result:** Handles invalid IDs gracefully

#### 12.4 Network Error Simulation
- [ ] Start itinerary generation
- [ ] Disable network (Dev Tools)
- [ ] Verify error message appears
- [ ] Re-enable network
- [ ] Verify can retry

**Expected Result:** Network errors handled

---

### 13. Mobile Responsiveness

#### 13.1 Mobile Layout - Homepage
- [ ] Open Chrome Dev Tools
- [ ] Toggle device toolbar (mobile view)
- [ ] Set to iPhone 12 Pro
- [ ] Verify homepage responsive:
  - [ ] Header fits
  - [ ] Buttons readable
  - [ ] Text readable
  - [ ] No horizontal scroll

**Expected Result:** Homepage mobile-friendly

#### 13.2 Mobile Layout - Dashboard
- [ ] In mobile view, navigate to dashboard
- [ ] Verify layout adapts:
  - [ ] Quick actions stack vertically
  - [ ] Chat interface fits
  - [ ] Buttons touchable

**Expected Result:** Dashboard mobile-friendly

#### 13.3 Mobile Layout - Templates
- [ ] Navigate to templates page
- [ ] Verify:
  - [ ] Grid becomes single column
  - [ ] Cards readable
  - [ ] Buttons work

**Expected Result:** Templates mobile-friendly

#### 13.4 Mobile Layout - Spots
- [ ] Navigate to spots page
- [ ] Verify:
  - [ ] Filters accessible
  - [ ] Grid adapts (1-2 columns)
  - [ ] Cards readable

**Expected Result:** Spots page mobile-friendly

#### 13.5 Mobile Layout - Itinerary Detail
- [ ] View itinerary on mobile
- [ ] Verify:
  - [ ] Activities readable
  - [ ] Days collapsible
  - [ ] Buttons accessible
  - [ ] No overflow

**Expected Result:** Itinerary mobile-friendly

#### 13.6 Mobile Layout - Editing
- [ ] Access edit mode on mobile
- [ ] Verify:
  - [ ] Edit controls accessible
  - [ ] Drag handles work on touch
  - [ ] Forms usable

**Expected Result:** Editing mobile-friendly

---

### 14. Cross-Browser Testing

#### 14.1 Chrome
- [ ] Test all flows in Chrome
- [ ] Note any issues

**Expected Result:** All features work

#### 14.2 Firefox
- [ ] Test critical flows in Firefox:
  - [ ] Sign in
  - [ ] Generate itinerary
  - [ ] Edit itinerary
  - [ ] Browse spots
- [ ] Note any visual differences

**Expected Result:** All features work

#### 14.3 Safari (if available)
- [ ] Test critical flows in Safari
- [ ] Note any issues

**Expected Result:** All features work

#### 14.4 Edge
- [ ] Test critical flows in Edge
- [ ] Note any issues

**Expected Result:** All features work

---

### 15. Performance Testing

#### 15.1 Page Load Times
- [ ] Use Chrome DevTools Lighthouse
- [ ] Test homepage
- [ ] Verify:
  - [ ] Load time < 3s
  - [ ] Performance score > 80

**Expected Result:** Good performance

#### 15.2 Large Itinerary Performance
- [ ] Generate 7-day itinerary (max)
- [ ] Navigate to detail page
- [ ] Verify loads quickly
- [ ] Test editing performance
- [ ] Verify no lag

**Expected Result:** Handles large data

#### 15.3 Spots Page with Filters
- [ ] Load spots page
- [ ] Apply multiple filters rapidly
- [ ] Verify no lag
- [ ] Verify smooth filtering

**Expected Result:** Filters performant

---

## 🐛 Bug Tracking

### Discovered Bugs
*Record bugs found during testing*

| # | Feature | Description | Severity | Status |
|---|---------|-------------|----------|--------|
| 1 | | | | |
| 2 | | | | |

### Severity Levels
- **Critical:** Blocks core functionality
- **High:** Major feature broken
- **Medium:** Feature partially broken
- **Low:** Minor issue, cosmetic

---

## ✅ Test Results Summary

### Test Categories
- [ ] User Authentication: _/_ tests passed
- [ ] Itinerary Generation: _/_ tests passed
- [ ] Template Generation: _/_ tests passed
- [ ] Itinerary Editing: _/_ tests passed
- [ ] Spot Discovery: _/_ tests passed
- [ ] SEO Implementation: _/_ tests passed
- [ ] Mobile Responsiveness: _/_ tests passed
- [ ] Cross-Browser: _/_ tests passed
- [ ] Performance: _/_ tests passed

### Overall Status
**Tests Passed:** _ / _
**Tests Failed:** _
**Bugs Found:** _
**Bugs Fixed:** _

---

## 📋 Next Steps After Testing

1. Fix all critical and high severity bugs
2. Fix medium severity bugs if time allows
3. Document known low severity issues
4. Re-test fixed bugs
5. Run final build test
6. Prepare for production deployment

---

**Testing started:** 2025-11-27
**Testing completed:** _TBD_
**Tester:** Claude Code
**Status:** In Progress
