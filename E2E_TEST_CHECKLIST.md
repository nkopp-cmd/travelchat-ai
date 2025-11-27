# End-to-End Test Checklist

**Test Date:** November 24, 2025  
**Tester:** _____________  
**Environment:** Development (http://localhost:3000)

---

## 🧪 Test Instructions

Run through each test scenario and mark as ✅ Pass, ❌ Fail, or ⚠️ Partial.

---

## 1. Landing Page & Navigation

### Landing Page (/)
- [ ] Page loads without errors
- [ ] Hero section displays with background image
- [ ] "Start Exploring" button visible
- [ ] "Learn More" button visible
- [ ] Floating search bar displays
- [ ] Features section shows 3 cards
- [ ] Animations work smoothly
- [ ] Responsive on mobile (resize browser)

**Issues Found:**
```
_____________________________________________
_____________________________________________
```

---

## 2. Authentication Flow

### Sign Up (/sign-up)
- [ ] Sign-up page loads
- [ ] Clerk sign-up form displays
- [ ] Can create account with email
- [ ] Can sign up with Google (if configured)
- [ ] Redirects to dashboard after signup

### Sign In (/sign-in)
- [ ] Sign-in page loads
- [ ] Clerk sign-in form displays
- [ ] Can sign in with email
- [ ] Can sign in with Google (if configured)
- [ ] Redirects to dashboard after signin

**Issues Found:**
```
_____________________________________________
_____________________________________________
```

---

## 3. Dashboard (/dashboard)

### Layout
- [ ] Dashboard loads without errors
- [ ] Stories component displays at top
- [ ] Current Vibe card shows featured spot
- [ ] Chat interface loads below

### Stories Section
- [ ] Story bubbles display (even if placeholders)
- [ ] Can scroll horizontally through stories
- [ ] Hover effects work

### Current Vibe Card
- [ ] Shows spot name
- [ ] Shows Localley score
- [ ] Click navigates to spot detail

### Chat Interface
- [ ] Initial Alley message displays
- [ ] Can type in input field
- [ ] Can send message
- [ ] AI responds (may take 5-10 seconds)
- [ ] Messages display correctly
- [ ] Auto-scrolls to latest message
- [ ] Loading skeleton shows while waiting
- [ ] "New Chat" button works
- [ ] "History" button shows conversations

**Issues Found:**
```
_____________________________________________
_____________________________________________
```

---

## 4. Spots Discovery (/spots)

### Spots Listing
- [ ] Page loads without errors
- [ ] "Discover Spots" heading displays
- [ ] Spots grid displays (may be empty if no data)
- [ ] Loading skeletons show initially
- [ ] If no spots: Shows empty state gracefully

### Spot Cards (if data exists)
- [ ] Each card shows spot name
- [ ] Shows category badge
- [ ] Shows Localley score
- [ ] Shows location
- [ ] Hover effects work
- [ ] Click navigates to detail page

**Issues Found:**
```
_____________________________________________
_____________________________________________
```

---

## 5. Spot Detail (/spots/[id])

### Spot Detail Page
- [ ] Page loads without errors
- [ ] Spot name displays
- [ ] Category badges show
- [ ] Localley score displays
- [ ] Description shows
- [ ] Map displays (Mapbox)
- [ ] Map shows correct location marker
- [ ] Photos gallery displays
- [ ] Tips section shows
- [ ] Best time to visit shows
- [ ] "Back" navigation works

**Issues Found:**
```
_____________________________________________
_____________________________________________
```

---

## 6. Itineraries (/itineraries)

### Itineraries Listing
- [ ] Page loads without errors
- [ ] "Your Itineraries" heading displays
- [ ] "New Itinerary" button visible
- [ ] Mock itinerary card displays
- [ ] Click on card navigates to detail

### Itinerary Detail (/itineraries/[id])
- [ ] Detail page loads
- [ ] Itinerary title shows
- [ ] Day-by-day breakdown displays
- [ ] Activities show with times
- [ ] Map shows route (if implemented)
- [ ] Can navigate back

**Issues Found:**
```
_____________________________________________
_____________________________________________
```

---

## 7. Profile (/profile)

### Profile Page
- [ ] Page loads without errors
- [ ] User avatar displays
- [ ] Username shows
- [ ] Level and rank display
- [ ] XP progress bar shows
- [ ] Stats cards show (Discoveries, Streak, Badges)
- [ ] Achievements tab works
- [ ] History tab works
- [ ] Saved tab works
- [ ] Achievement cards display
- [ ] Progress bars animate

**Issues Found:**
```
_____________________________________________
_____________________________________________
```

---

## 8. Settings (/settings)

### Settings Page
- [ ] Page loads without errors
- [ ] Settings form displays
- [ ] Can toggle preferences
- [ ] Save button works
- [ ] Changes persist

**Issues Found:**
```
_____________________________________________
_____________________________________________
```

---

## 9. Mobile Responsiveness

### Test on Mobile Size (375px width)
- [ ] Landing page responsive
- [ ] Dashboard responsive
- [ ] Chat interface usable
- [ ] Spots grid adjusts to 1 column
- [ ] Navigation menu works
- [ ] Profile page responsive
- [ ] All buttons touchable (min 44px)

**Issues Found:**
```
_____________________________________________
_____________________________________________
```

---

## 10. Error Handling

### Error Scenarios
- [ ] Navigate to non-existent route (e.g., /nonexistent)
- [ ] Error boundary catches errors
- [ ] 404 page displays (if implemented)
- [ ] Can navigate back from error

### API Errors
- [ ] Disconnect internet, try to send chat message
- [ ] Error message displays gracefully
- [ ] App doesn't crash

**Issues Found:**
```
_____________________________________________
_____________________________________________
```

---

## 11. Performance

### Load Times
- [ ] Landing page loads in < 3 seconds
- [ ] Dashboard loads in < 3 seconds
- [ ] Spots page loads in < 3 seconds
- [ ] Chat responses in < 10 seconds
- [ ] No layout shift during load

### Animations
- [ ] Animations smooth (60fps)
- [ ] No janky scrolling
- [ ] Transitions work properly

**Issues Found:**
```
_____________________________________________
_____________________________________________
```

---

## 12. Data Persistence

### Database Operations
- [ ] New conversations save to database
- [ ] Messages persist after refresh
- [ ] User progress updates
- [ ] XP changes reflect in profile

**Issues Found:**
```
_____________________________________________
_____________________________________________
```

---

## 13. Browser Compatibility

### Test in Multiple Browsers
- [ ] Chrome/Edge (Chromium)
- [ ] Firefox
- [ ] Safari (if on Mac)

**Issues Found:**
```
_____________________________________________
_____________________________________________
```

---

## 🐛 Critical Bugs Found

List any critical bugs that prevent core functionality:

1. _______________________________________________
2. _______________________________________________
3. _______________________________________________

---

## ⚠️ Non-Critical Issues Found

List any minor issues or improvements needed:

1. _______________________________________________
2. _______________________________________________
3. _______________________________________________

---

## ✅ Overall Assessment

**Pass Rate:** _____ / _____ tests passed

**Overall Status:** 
- [ ] ✅ Ready for staging
- [ ] ⚠️ Needs minor fixes
- [ ] ❌ Needs major fixes

**Tester Notes:**
```
_____________________________________________
_____________________________________________
_____________________________________________
```

---

## 📸 Screenshots

Attach screenshots of:
1. Landing page
2. Dashboard
3. Chat interface with AI response
4. Spots listing
5. Spot detail with map
6. Profile page
7. Any errors encountered

---

**Test Completed:** _______________  
**Time Taken:** _______________  
**Next Steps:** _______________
