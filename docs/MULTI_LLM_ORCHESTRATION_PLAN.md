# Multi-LLM Orchestration System - Sprint Plan

## Executive Summary

This document outlines the implementation plan for a multi-LLM architecture that uses:
- **ChatGPT (GPT-4o)**: Creative itinerary design and activity descriptions
- **Gemini**: Location validation, image generation, and Google Maps integration
- **Claude**: Team leader/supervisor for fact-checking, quality assurance, and final approval

### Key Principles (Based on User Requirements)
1. **Quality over Speed**: Thoroughly validated results are priority, but keep latency optimization in mind
2. **Caching**: Implement smart caching for common cities and validation results
3. **Retry with Fallback**: Always retry on failure; if still fails, use backup route (Plan B)
4. **Tier Differentiation**: Different LLM depth based on subscription tier

---

## Architecture Overview

```
                          ┌─────────────────────────────┐
                          │      USER REQUEST           │
                          └─────────────┬───────────────┘
                                        │
                                        ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                           ORCHESTRATOR SERVICE                                 │
│  • Request validation & tier checking                                         │
│  • Task distribution & parallel execution                                     │
│  • Result aggregation & error handling                                        │
│  • Retry logic with fallback routes                                           │
└───────────────────────────────────────┬───────────────────────────────────────┘
                                        │
              ┌─────────────────────────┼─────────────────────────┐
              │                         │                         │
              ▼                         ▼                         ▼
┌─────────────────────────┐ ┌─────────────────────────┐ ┌─────────────────────────┐
│   CHATGPT WORKER        │ │   GEMINI WORKER         │ │   DATABASE WORKER       │
│   (Parallel Phase 1)    │ │   (Parallel Phase 1)    │ │   (Parallel Phase 1)    │
│                         │ │                         │ │                         │
│ • Itinerary structure   │ │ • Location validation   │ │ • Verified spots fetch  │
│ • Activity descriptions │ │ • Google Places data    │ │ • User preferences      │
│ • Timing & logistics    │ │ • Opening hours         │ │ • Cached validations    │
│ • Creative storytelling │ │ • Image generation      │ │ • Historical patterns   │
└────────────┬────────────┘ └────────────┬────────────┘ └────────────┬────────────┘
             │                           │                           │
             └───────────────────────────┼───────────────────────────┘
                                         │
                                         ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                         CLAUDE SUPERVISOR (Phase 2)                           │
│  • Merge parallel results into coherent itinerary                             │
│  • Fact-check: locations exist, times realistic, distances logical            │
│  • Cross-reference ChatGPT suggestions with Gemini location data              │
│  • Quality assurance: no generic names, proper structure                      │
│  • Budget verification against real prices                                    │
│  • Final approval or request re-generation of specific parts                  │
└───────────────────────────────────────┬───────────────────────────────────────┘
                                        │
                                        ▼
                          ┌─────────────────────────────┐
                          │     FINAL RESPONSE          │
                          │  (Validated & Enriched)     │
                          └─────────────────────────────┘
```

---

## Sprint Breakdown

### Sprint 1: Foundation Layer (Infrastructure)
**Goal**: Create the base orchestration infrastructure without breaking existing code

#### Tasks:
1. **Create LLM Provider Abstractions**
   - `lib/llm/providers/base.ts` - Base interface for all LLM providers
   - `lib/llm/providers/openai.ts` - OpenAI/ChatGPT implementation
   - `lib/llm/providers/gemini.ts` - Gemini implementation
   - `lib/llm/providers/claude.ts` - Claude/Anthropic implementation (NEW)

2. **Create Orchestrator Core**
   - `lib/llm/orchestrator.ts` - Main coordinator service
   - `lib/llm/types.ts` - Shared types and interfaces
   - `lib/llm/config.ts` - Configuration and feature flags

3. **Add Claude SDK Integration**
   - Add `@anthropic-ai/sdk` to dependencies
   - Configure environment variables
   - Create Claude client wrapper

4. **Create Retry & Fallback Logic**
   - `lib/llm/retry.ts` - Retry with exponential backoff
   - `lib/llm/fallback.ts` - Fallback route definitions

#### Deliverables:
- New `lib/llm/` directory structure
- All provider abstractions implemented
- Claude SDK integrated
- No changes to existing endpoints (backward compatible)

---

### Sprint 2: Parallel Execution Engine
**Goal**: Implement parallel task execution with proper error handling

#### Tasks:
1. **Create Task Queue System**
   - `lib/llm/tasks/queue.ts` - Task queue with priority support
   - `lib/llm/tasks/executor.ts` - Parallel task executor

2. **Implement Worker Tasks**
   - `lib/llm/tasks/generate-structure.ts` - ChatGPT itinerary generation
   - `lib/llm/tasks/validate-locations.ts` - Gemini location validation
   - `lib/llm/tasks/fetch-spots.ts` - Database spot fetching
   - `lib/llm/tasks/generate-images.ts` - Gemini image generation

3. **Create Result Aggregator**
   - `lib/llm/aggregator.ts` - Merge results from parallel tasks
   - Handle partial failures gracefully

4. **Implement Caching Layer**
   - `lib/llm/cache.ts` - Redis/memory cache for validations
   - Cache location validation results per city
   - Cache Claude approval patterns for common scenarios

#### Deliverables:
- Parallel execution working with `Promise.allSettled()`
- Graceful degradation on partial failures
- Caching infrastructure ready

---

### Sprint 3: Claude Supervisor Integration
**Goal**: Implement Claude as the team leader for quality assurance

#### Tasks:
1. **Create Supervisor Service**
   - `lib/llm/supervisor/index.ts` - Main supervisor logic
   - `lib/llm/supervisor/prompts.ts` - Supervisor system prompts
   - `lib/llm/supervisor/validators.ts` - Validation functions

2. **Implement Fact-Checking**
   - Location existence verification
   - Time/distance logic validation
   - Budget accuracy checking
   - Opening hours verification

3. **Create Feedback Loop**
   - Claude can request re-generation of specific activities
   - Targeted retry instead of full regeneration
   - Maximum 2 revision cycles before fallback

4. **Quality Scoring System**
   - Claude assigns quality score to itinerary
   - Track quality metrics for analytics
   - Use scores for caching decisions

#### Deliverables:
- Claude supervisor fully integrated
- Fact-checking pipeline working
- Feedback loop with targeted retries

---

### Sprint 4: New API Endpoint & Tier Integration
**Goal**: Create new orchestrated endpoint alongside existing one

#### Tasks:
1. **Create New Endpoint**
   - `app/api/itineraries/generate-v2/route.ts` - New orchestrated endpoint
   - Keep existing endpoint unchanged as fallback

2. **Implement Tier-Based Routing**
   ```
   Free tier:    ChatGPT only (current behavior)
   Pro tier:     ChatGPT + Gemini validation + Basic Claude check
   Premium tier: Full orchestration + Priority processing + Extended retries
   ```

3. **Add Feature Flags**
   - `ENABLE_MULTI_LLM` environment variable
   - Gradual rollout capability
   - A/B testing support

4. **Streaming Response Support**
   - Return draft immediately (Phase 1 result)
   - Stream enhanced version via SSE/WebSocket
   - Final validated version notification

#### Deliverables:
- New `/api/itineraries/generate-v2` endpoint
- Tier-based routing working
- Feature flags for controlled rollout

---

### Sprint 5: Fallback & Recovery System
**Goal**: Implement robust Plan B routes for all failure scenarios

#### Tasks:
1. **Define Fallback Routes**
   ```typescript
   // Primary Route
   ChatGPT → Gemini Validation → Claude Approval

   // Fallback Route A (Gemini fails)
   ChatGPT → Claude Validation → Claude Approval

   // Fallback Route B (Claude fails)
   ChatGPT → Gemini Validation → Rule-based Validation

   // Fallback Route C (ChatGPT fails)
   Gemini Text Gen → Claude Enhancement → Claude Approval

   // Emergency Route (Multiple failures)
   Single LLM (whoever is available) + Database spots only
   ```

2. **Implement Circuit Breaker**
   - Track failure rates per provider
   - Auto-switch to fallback on high failure rate
   - Self-healing when provider recovers

3. **Error Analytics**
   - Log all failures with context
   - Track which fallback routes are used
   - Alert on sustained failures

4. **Graceful Degradation UI**
   - Inform user if using fallback mode
   - Set expectations for quality
   - Offer retry option

#### Deliverables:
- All fallback routes implemented
- Circuit breaker working
- Error analytics dashboard data

---

### Sprint 6: Optimization & Monitoring
**Goal**: Optimize performance and add comprehensive monitoring

#### Tasks:
1. **Latency Optimization**
   - Profile each LLM call duration
   - Identify bottlenecks
   - Implement request batching where possible

2. **Smart Caching**
   - Cache Claude validation patterns by city
   - Cache "known good" location data
   - Invalidation strategy for stale data

3. **Monitoring Dashboard**
   - Per-LLM success rates
   - Average latency by provider
   - Cache hit rates
   - Fallback route usage

4. **Cost Tracking**
   - Track token usage per provider
   - Calculate cost per itinerary
   - Tier-based cost allocation

#### Deliverables:
- Optimized latency (target: <8s for full orchestration)
- Comprehensive monitoring
- Cost tracking per user/tier

---

## File Structure

```
lib/
├── llm/
│   ├── index.ts                    # Main exports
│   ├── orchestrator.ts             # Core orchestration logic
│   ├── types.ts                    # Shared types
│   ├── config.ts                   # Configuration
│   ├── cache.ts                    # Caching layer
│   ├── retry.ts                    # Retry logic
│   ├── fallback.ts                 # Fallback route definitions
│   ├── circuit-breaker.ts          # Circuit breaker pattern
│   │
│   ├── providers/
│   │   ├── base.ts                 # Base provider interface
│   │   ├── openai.ts               # ChatGPT provider
│   │   ├── gemini.ts               # Gemini provider
│   │   └── claude.ts               # Claude provider (NEW)
│   │
│   ├── tasks/
│   │   ├── queue.ts                # Task queue
│   │   ├── executor.ts             # Parallel executor
│   │   ├── generate-structure.ts   # ChatGPT itinerary task
│   │   ├── validate-locations.ts   # Gemini validation task
│   │   ├── generate-images.ts      # Gemini image task
│   │   └── fetch-spots.ts          # Database spots task
│   │
│   ├── supervisor/
│   │   ├── index.ts                # Claude supervisor
│   │   ├── prompts.ts              # Supervisor prompts
│   │   ├── validators.ts           # Validation functions
│   │   └── feedback.ts             # Feedback loop logic
│   │
│   └── aggregator.ts               # Result aggregation

app/api/itineraries/
├── generate/route.ts               # EXISTING - Keep unchanged
└── generate-v2/route.ts            # NEW - Orchestrated endpoint
```

---

## Environment Variables

```env
# Existing
OPENAI_API_KEY=...
GEMINI_API_KEY=...

# New - Claude
ANTHROPIC_API_KEY=...
CLAUDE_MODEL=claude-sonnet-4-20250514

# Feature Flags
ENABLE_MULTI_LLM=true
MULTI_LLM_FREE_TIER=false
MULTI_LLM_PRO_TIER=true
MULTI_LLM_PREMIUM_TIER=true

# Caching
LLM_CACHE_TTL=3600
LLM_CACHE_LOCATIONS_TTL=86400

# Circuit Breaker
CIRCUIT_BREAKER_THRESHOLD=5
CIRCUIT_BREAKER_RESET_MS=60000
```

---

## Tier Differentiation Matrix

| Feature | Free | Pro | Premium |
|---------|------|-----|---------|
| LLM Count | 1 (ChatGPT) | 2 (ChatGPT + Gemini) | 3 (All) |
| Claude Supervision | No | Basic check | Full QA |
| Location Validation | No | Gemini | Gemini + Claude |
| Retry Attempts | 1 | 2 | 3 |
| Fallback Routes | Emergency only | Route A, B | All routes |
| Image Generation | Placeholders | 50/month | 200/month |
| Caching | Shared | Dedicated | Priority |
| Estimated Latency | 3-5s | 5-8s | 8-12s |
| Quality Score Target | - | 7/10 | 9/10 |

---

## Cost Estimation Per Itinerary

| Provider | Tokens (est.) | Cost/1K | Est. Cost |
|----------|--------------|---------|-----------|
| GPT-4o (in) | 500 | $0.0025 | $0.00125 |
| GPT-4o (out) | 2000 | $0.01 | $0.02 |
| Gemini Flash (in) | 300 | $0.000075 | $0.00002 |
| Gemini Flash (out) | 500 | $0.0003 | $0.00015 |
| Claude Sonnet (in) | 1500 | $0.003 | $0.0045 |
| Claude Sonnet (out) | 500 | $0.015 | $0.0075 |

**Total per full orchestration**: ~$0.035
**Current (ChatGPT only)**: ~$0.02

---

## Migration Strategy

### Phase 1: Shadow Mode
- New endpoint runs in parallel with old
- Compare results but don't serve to users
- Gather metrics on quality and latency

### Phase 2: Opt-In Beta
- Premium users can opt-in to new endpoint
- Collect feedback and iterate
- Fallback to old endpoint on any error

### Phase 3: Gradual Rollout
- 10% → 25% → 50% → 100% of Pro/Premium users
- Monitor error rates and quality scores
- Keep old endpoint as permanent fallback

### Phase 4: Full Rollout
- New endpoint becomes default for Pro/Premium
- Old endpoint remains for Free tier
- Deprecate old endpoint after 3 months

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Claude API downtime | Fallback to rule-based validation |
| Higher latency | Streaming responses, progressive enhancement |
| Increased costs | Tier-based feature gating, caching |
| Inconsistent results | Supervisor quality scoring, reject low scores |
| Provider rate limits | Retry with backoff, circuit breaker |

---

## Success Metrics

1. **Quality**: 90%+ itineraries pass Claude QA on first try
2. **Latency**: 95th percentile < 12s for full orchestration
3. **Reliability**: 99.5% success rate with fallbacks
4. **Cost**: < $0.05 per Premium itinerary
5. **User Satisfaction**: NPS improvement for orchestrated itineraries

---

## Next Steps

1. Review and approve this plan
2. Set up environment variables for Claude API
3. Begin Sprint 1 implementation
4. Create tracking issues for each sprint

---

*Document Version: 1.0*
*Created: December 2024*
*Status: Awaiting Approval*
