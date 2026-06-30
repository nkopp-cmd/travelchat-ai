/**
 * LLM Orchestration Metrics Endpoint
 *
 * Returns aggregated metrics for the multi-LLM system.
 * Requires admin authentication.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  GLMProvider,
  getMetricsCollector,
  getOrchestrator,
  estimateOrchestrationCost,
} from '@/lib/llm';
import { requireAdmin } from '@/lib/admin-auth';
import { getTrimmedEnv, readGLMProviderConfig } from '@/lib/llm/env';

async function getChatProviderReadiness(runGlmHealthCheck: boolean) {
  const glm = new GLMProvider();
  const glmConfig = readGLMProviderConfig();
  const glmConfigured = glm.isAvailable();
  let glmHealthy: boolean | null = null;

  if (runGlmHealthCheck && glmConfigured) {
    glmHealthy = await glm.healthCheck();
  }

  return {
    primary: 'glm',
    fallback: 'anthropic',
    glm: {
      configured: glmConfigured,
      healthChecked: runGlmHealthCheck,
      healthy: glmHealthy,
      model: glmConfig.model,
      baseUrl: glmConfig.baseURL,
      env: {
        hasGlmApiKey: Boolean(getTrimmedEnv('GLM_API_KEY')),
        hasZaiApiKey: Boolean(getTrimmedEnv('ZAI_API_KEY')),
        apiKeySource: glmConfig.apiKeySource,
      },
    },
    anthropicFallback: {
      configured: Boolean(getTrimmedEnv('ANTHROPIC_API_KEY')),
      model:
        getTrimmedEnv('CLAUDE_MODEL') ||
        getTrimmedEnv('ANTHROPIC_MODEL') ||
        getTrimmedEnv('CHAT_MODEL') ||
        'claude-sonnet-4-20250514',
    },
  };
}

export async function GET(req: NextRequest) {
  try {
    const { response } = await requireAdmin('/api/admin/llm-metrics', 'GET');
    if (response) return response;
    const runGlmHealthCheck = req.nextUrl.searchParams.get('health') === 'glm';

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
    const chatProviderReadiness = await getChatProviderReadiness(runGlmHealthCheck);

    return NextResponse.json({
      success: true,
      metrics,
      health,
      chatProviderReadiness,
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
