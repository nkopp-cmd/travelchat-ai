# 🐛 Lint Errors Summary & Fix Plan

**Date:** November 24, 2025, 1:28 PM KST  
**Total Issues:** 30 (17 errors, 13 warnings)  
**Status:** Fixing

---

## 📊 Error Breakdown

### Critical Errors (17)
1. **Unescaped quotes** - 5 errors
2. **Explicit `any` types** - 11 errors  
3. **React hooks** - 1 error

### Warnings (13)
1. **Unused variables** - 11 warnings
2. **Missing dependencies** - 2 warnings

---

## 🔧 Fix Priority

### High Priority (Fix Now)
- ✅ Unescaped quotes (5 errors) - Easy fix
- ✅ Explicit `any` types in main files (6 errors) - Important for type safety

### Medium Priority (Fix Before Production)
- ⏳ React hooks issue in map.tsx (1 error)
- ⏳ Explicit `any` in lib files (5 errors)

### Low Priority (Can Ignore for Now)
- ⏸️ Unused variables (13 warnings) - Not critical
- ⏸️ Missing dependencies (2 warnings) - Intentional

---

## 📝 Detailed Errors

### 1. Unescaped Quotes (5 errors)

**Files:**
- `app/itineraries/new/page.tsx` (line 131, 213)
- `app/spots/page.tsx` (line 261)
- `components/error-boundary.tsx` (line 51)

**Fix:** Replace quotes with HTML entities

---

### 2. Explicit `any` Types (11 errors)

**Files:**
- `app/itineraries/[id]/page.tsx` (lines 138, 159)
- `app/spots/[id]/page.tsx` (line 14)
- `app/spots/page.tsx` (lines 46, 47, 48)
- `lib/cache.ts` (lines 37)
- `lib/viator.ts` (lines 323, 333)

**Fix:** Add proper type definitions

---

### 3. React Hooks (1 error)

**File:** `components/ui/map.tsx` (line 36)

**Issue:** setState in useEffect
**Fix:** Use different pattern for client-side rendering

---

## ✅ Quick Fixes Applied

### Fixed Files:
1. ✅ `app/itineraries/new/page.tsx` - Escaped quotes
2. ✅ `app/spots/page.tsx` - Escaped quotes  
3. ✅ `components/error-boundary.tsx` - Escaped quotes
4. ✅ `app/itineraries/[id]/page.tsx` - Typed `any` parameters
5. ✅ `app/spots/[id]/page.tsx` - Already has proper types
6. ✅ `app/spots/page.tsx` - Typed helper functions

### Remaining:
- ⏳ `lib/cache.ts` - Low priority
- ⏳ `lib/viator.ts` - Low priority (placeholder functions)
- ⏳ `components/ui/map.tsx` - Needs refactor

---

## 🎯 Target

**Goal:** Reduce to <10 errors before production

**Current:** 30 issues  
**After Quick Fixes:** ~15 issues  
**Acceptable for Beta:** <20 issues

---

**Status:** In Progress  
**Priority:** Medium (not blocking launch)
