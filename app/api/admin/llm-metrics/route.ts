/**
 * LLM Orchestration Metrics Endpoint
 *
 * Returns aggregated metrics for the multi-LLM system.
 * Requires admin authentication.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getMetricsCollector, getOrchestrator, estimateOrchestrationCost } from '@/lib/llm';
import { requireAdmin } from '@/lib/admin-auth';

export async function GET(req: NextRequest) {
  try {
    const { response, userId } = await requireAdmin('/api/admin/llm-metrics', 'GET');
    if (response) return response;

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
    const { response } = await requireAdmin('/api/admin/llm-metrics', 'POST:clear');
    if (response) return response;

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
