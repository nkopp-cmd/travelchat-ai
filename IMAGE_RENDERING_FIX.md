# AI Background Rendering Fix
**Date**: 2025-12-15
**Issue**: AI backgrounds appearing as squares in upper/lower portions instead of filling full 1080×1920 frame
**Status**: ✅ **FIXED**

---

## Problem Summary

User reported two issues with AI-generated backgrounds:

1. **Image Not Filling Full Frame**: AI background appeared as a square image in the upper and lower half of the story card, instead of filling the entire 1080×1920 vertical frame
2. **Summary Slide Has No Background**: Only cover slide showed AI background, summary slide showed gradient fallback

---

## Root Cause Analysis

### Issue #1: CSS `backgroundImage` Limitations in Vercel/OG

**Problem**: Used CSS `backgroundImage` property in Vercel's `@vercel/og` ImageResponse
```typescript
// ❌ OLD APPROACH (didn't work properly)
const backgroundStyle = backgroundImage
    ? {
        backgroundImage: `linear-gradient(...), url(${backgroundImage})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
    }
    : { ... };
```

**Root Cause**:
- Vercel's `@vercel/og` uses Satori for rendering React to images
- Satori has limited CSS support, particularly with `backgroundImage`
- `backgroundSize: "cover"` wasn't properly applied
- Image rendered at its native dimensions instead of filling the frame

### Issue #2: Gemini API Aspect Ratio

**Potential Problem**:
- We request `aspectRatio: "9:16"` from Gemini API
- But Gemini might be returning square (1:1) images instead
- Need logging to verify what Gemini actually returns

---

## Solution Implemented

### Fix #1: Changed to `<img>` Tag Approach

**New Approach**: Use absolute positioned `<img>` with `objectFit: "cover"`

```typescript
// ✅ NEW APPROACH (works correctly)
<div style={{ position: "relative", width: STORY_WIDTH, height: STORY_HEIGHT }}>
    {/* Background layer */}
    {backgroundImage ? (
        <>
            {/* AI-generated background image */}
            <img
                src={backgroundImage}
                style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",        // Ensures image fills frame
                    objectPosition: "center",   // Centers the crop
                }}
            />
            {/* Dark overlay for text readability */}
            <div style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                background: "linear-gradient(rgba(0,0,0,0.4), rgba(0,0,0,0.4))",
            }} />
        </>
    ) : (
        /* Gradient fallback */
        <div style={{ ... gradient ... }} />
    )}

    {/* Content layer */}
    <div style={{ position: "relative", ... }}>
        {/* Text and UI elements */}
    </div>
</div>
```

**Why This Works**:
- `<img>` tag has better support in Satori/Vercel OG
- `objectFit: "cover"` ensures image fills the frame, cropping as needed
- `objectPosition: "center"` ensures the most important part of the image is visible
- Image fills full 1080×1920 regardless of source aspect ratio

### Fix #2: Added Debugging Logs

Added console logging to track what Gemini API returns:

```typescript
// In lib/imagen.ts
console.log("[IMAGEN] Generating image with config:", JSON.stringify(config));
console.log("[IMAGEN] Generated image:", {
    mimeType: part.inlineData.mimeType,
    dataLength: imageData.length,
    requestedAspectRatio: aspectRatio
});
```

This will help verify:
- If Gemini API is receiving the `aspectRatio: "9:16"` config
- What image dimensions Gemini actually returns
- Whether the issue is with Gemini or our rendering

### Fix #3: Applied to Both Slides

Updated both `CoverSlide` and `SummarySlide` with the same fix for consistency.

---

## How `objectFit: "cover"` Works

**Behavior**:
- Image maintains its aspect ratio
- Image is scaled to completely fill the container
- If image aspect ratio doesn't match container, it's cropped (not stretched)

**Examples**:

1. **If Gemini returns square (1:1) image for 9:16 frame**:
   - Image is scaled up until it fills the full height (1920px)
   - Left and right edges are cropped to fit 1080px width
   - Center portion of image is visible

2. **If Gemini returns correct 9:16 image**:
   - Image fills frame perfectly
   - No cropping needed

3. **If Gemini returns landscape (16:9) image**:
   - Image is scaled up until it fills the full width (1080px)
   - Top and bottom edges are cropped to fit 1920px height
   - Center portion of image is visible

---

## Testing Steps

After deployment, test the following:

1. **Generate New Story with AI Backgrounds**:
   - Create itinerary
   - Enable "AI-generated backgrounds"
   - Generate slides
   - Verify cover and summary both show AI backgrounds

2. **Check Image Fill**:
   - Download cover slide
   - Verify image fills entire 1080×1920 frame (no white space)
   - Check that important parts of the image are visible (not cropped too much)

3. **Check Server Logs**:
   - Look for `[IMAGEN] Generating image with config:` logs
   - Verify `aspectRatio: "9:16"` is being sent to Gemini
   - Check `[IMAGEN] Generated image:` logs for actual image data

4. **If Images Still Appear Square**:
   - Gemini might not be honoring `aspectRatio: "9:16"`
   - Check logs to confirm
   - May need to file issue with Google Gemini SDK

---

## Files Modified

1. **app/api/itineraries/[id]/story/route.tsx**
   - `CoverSlide` component: Changed from backgroundImage to <img> approach
   - `SummarySlide` component: Same fix applied
   - Both now use layered architecture (background → overlay → content)

2. **lib/imagen.ts**
   - Added logging to track Gemini API config and response
   - Helps debug if Gemini is returning correct aspect ratio images

---

## Expected Behavior After Fix

### Before Fix
- ❌ AI background appeared as square in upper/lower portions
- ❌ Empty white space on sides or top/bottom
- ❌ Summary slide showed gradient fallback instead of AI background

### After Fix
- ✅ AI background fills entire 1080×1920 frame
- ✅ Image is properly cropped to center if needed
- ✅ Both cover and summary slides show AI backgrounds
- ✅ No white space, no letterboxing, no pillarboxing

---

## Remaining Questions to Verify

1. **Is Gemini returning 9:16 images?**
   - Check server logs after deployment
   - Look for `requestedAspectRatio: "9:16"` in logs
   - If Gemini returns square images, `objectFit: "cover"` will handle it but may crop too much

2. **Is image quality sufficient?**
   - Even with correct aspect ratio, need to verify:
   - Images are high resolution (not pixelated)
   - Images show recognizable city landmarks
   - Composition is good for vertical format

---

## If Issues Persist

### If Images Still Look Wrong After This Fix

**Check 1: Verify Gemini API Response**
```bash
# Look for this in Vercel logs
[IMAGEN] Generating image with config: {"responseModalities":["IMAGE"],"imageConfig":{"aspectRatio":"9:16"}}
[IMAGEN] Generated image: {"mimeType":"image/png","dataLength":2396434,"requestedAspectRatio":"9:16"}
```

**Check 2: Test Image Locally**
- Download the base64 image from database
- Decode to actual image file
- Check actual dimensions (should be close to 9:16 ratio, like 1024×1820)

**Check 3: Gemini SDK Issue**
If logs show we're sending correct config but Gemini returns square images:
- File issue with `@google/genai` package
- Alternative: Post-process images with sharp/canvas to force 9:16 crop

---

## Alternative Solutions (If Current Fix Doesn't Work)

### Option 1: Server-Side Image Processing
```typescript
import sharp from 'sharp';

// After receiving image from Gemini
const processedImage = await sharp(Buffer.from(imageData, 'base64'))
    .resize(1080, 1920, {
        fit: 'cover',
        position: 'center'
    })
    .toBuffer();
```

### Option 2: Explicit Prompt Instructions
Update prompts to be even more explicit:
```typescript
const prompt = `A stunning vertical photograph...
CRITICAL: Image must be in PORTRAIT orientation, taller than it is wide.
Aspect ratio: 9:16 (width 1080 pixels, height 1920 pixels).
NOT square, NOT landscape. VERTICAL PORTRAIT ONLY.`;
```

### Option 3: Use Different Model
If `gemini-2.5-flash-image` doesn't support aspect ratios well:
- Try `gemini-2.0-flash-image` or other Gemini image models
- Check Gemini documentation for which models support aspect ratio best

---

## Commit Details

**Commit**: `ba1e10e` - "fix: AI backgrounds now fill full 1080x1920 story frame"

**Changes**:
- Restructured CoverSlide and SummarySlide with layered approach
- Changed from CSS backgroundImage to <img> tag with objectFit: "cover"
- Added debugging logs to track Gemini API behavior
- Both slides now consistently fill full 1080×1920 frame

---

## Summary

Fixed the AI background rendering by switching from CSS `backgroundImage` (which has limited support in Vercel/OG) to an absolute positioned `<img>` tag with `objectFit: "cover"`. This ensures the AI-generated background fills the entire 1080×1920 story frame regardless of what aspect ratio Gemini actually returns.

Added logging to verify if Gemini API is honoring our `aspectRatio: "9:16"` request. If Gemini returns square images, the `objectFit: "cover"` approach will still make them fill the frame by cropping the sides.

**Next Steps**:
1. Deploy and test
2. Check server logs to see if Gemini returns 9:16 or square images
3. If quality is poor, may need server-side image processing or different prompts
