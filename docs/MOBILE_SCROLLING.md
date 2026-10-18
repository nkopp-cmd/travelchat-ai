# Mobile page scrolling

Ordinary pages use the document scrollport. The body has a dynamic minimum
viewport height, but no fixed height or overflow lock. This allows browser
chrome changes and long pricing, discovery, and account pages to grow naturally.
The shared main reserves 65px (including its existing border) plus the bottom safe-area inset wherever the
fixed mobile navigation is present. Desktop does not reserve mobile space.

The interactive chat page owns its bounded viewport: it subtracts the top and
bottom navigation, their existing borders, and the safe-area inset from 100dvh.
The desktop dashboard also bounds its chat area. Messages continue to scroll
inside the chat interface while its composer stays visible. Candidate history
uses document scrolling; the shared main does not lock all chat route variants.

Spots pagination uses native `scrollIntoView` with document scrolling. The
existing explicit-scroll-host compatibility path remains available for bounded
consumers. There is one main landmark.

## Verification contract

- Focused tests cover ordinary pages, absent navigation, chat, and pagination.
- Browser acceptance uses real touch gestures at 360, 390 and 430px.
- Retain each requested route, final resolved route, status, terminal control,
  actual scroll movement, control bounds, safe navigation clearance and screenshot.
- Reach every pricing subscription button and its final FAQ control.
- Verify shortened visible viewports and chat composer bounds.
- Anonymous redirects prove only the rendered sign-in view, not authenticated
  screens; report that distinction. Do not trigger payments, mail or AI generation.
- Exercise WebKit when installed; distinguish emulation from a physical iPhone.
- Record source, required CI, runtime version, actual rollback and live proof in
  the root shared plan. Broad visual and funnel changes need separate approval.
