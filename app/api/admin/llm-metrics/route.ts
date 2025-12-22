/**
 * LLM Orchestration Metrics Endpoint
 *
 * Returns aggregated metrics for the multi-LLM system.
 * Requires admin authentication.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { getMetricsCollector, getOrchestrator, estimateOrchestrationCost } from '@/lib/llm';

// Admin user IDs (should be in env or database)
const ADMIN_USER_IDS = (process.env.ADMIN_USER_IDS || '').split(',').filter(Boolean);

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();

    // Check authentication
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check admin access (skip in development)
    const isDev = process.env.NODE_ENV === 'development';
    if (!isDev && !ADMIN_USER_IDS.includes(userId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get metrics
    const collector = getMetricsCollector();
    const metrics = collector.getMetrics();

    // Get orchestrator health
    const orchestrator = getOrchestrator();
    const health = orchestrator.getHealthStatus();

    // Get cost estimates
    const costEstimates = {
      free: estimateOrchestrationCost('free'),
      pro: estimateOrchestrationCost('pro'),
      premium: estimateOrchestrationCost('premium'),
    };

    return NextResponse.json({
      success: true,
      metrics,
      health,
      costEstimates,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[llm-metrics] Error:', error);
    return NextResponse.json(
      { error: 'Failed to get metrics' },
      { status: 500 }
    );
  }
}

/**
 * POST endpoint to clear metrics (admin only)
 */
export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const isDev = process.env.NODE_ENV === 'development';
    if (!isDev && !ADMIN_USER_IDS.includes(userId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();

    if (body.action === 'clear') {
      const collector = getMetricsCollector();
      collector.clear();

      return NextResponse.json({
        success: true,
        message: 'Metrics cleared',
      });
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    );
  } catch (error) {
    console.error('[llm-metrics] Error:', error);
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
}
