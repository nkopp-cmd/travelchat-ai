/**
 * Print GLM-first chat readiness without exposing provider secrets.
 *
 * Usage:
 *   npm run llm:readiness
 *   npm run llm:readiness -- --env-file=.env.local
 *   npm run llm:readiness -- --health
 *   npm run llm:readiness -- --strict
 */

import * as dotenv from "dotenv";
import {
  getChatProviderReadinessActions,
  getChatProviderReadiness,
  getChatProviderReadinessFailure,
} from "../lib/llm/chat-readiness";

interface Args {
  envFile?: string;
  health: boolean;
  json: boolean;
  strict: boolean;
}

function parseArgs(argv: string[]): Args {
  const getValue = (name: string) => {
    const arg = argv.find((value) => value.startsWith(`${name}=`));
    return arg ? arg.slice(name.length + 1).trim() : undefined;
  };

  return {
    envFile: getValue("--env-file"),
    health: argv.includes("--health"),
    json: argv.includes("--json"),
    strict: argv.includes("--strict"),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  dotenv.config({ path: args.envFile || ".env.local", quiet: true });

  const readiness = await getChatProviderReadiness({
    runGlmHealthCheck: args.health,
  });

  const summary = {
    primary: readiness.primary,
    fallback: readiness.fallback,
    glmConfigured: readiness.glm.configured,
    glmHealthChecked: readiness.glm.healthChecked,
    glmHealthy: readiness.glm.healthy,
    glmModel: readiness.glm.model,
    glmBaseUrl: readiness.glm.baseUrl,
    glmApiKeySource: readiness.glm.env.apiKeySource,
    anthropicFallbackConfigured: readiness.anthropicFallback.configured,
    anthropicFallbackModel: readiness.anthropicFallback.model,
    openaiItineraryFallbackConfigured: readiness.itineraryFallback.configured,
    openaiItineraryFallbackModel: readiness.itineraryFallback.model,
    readyForGlmPrimary: readiness.readyForGlmPrimary,
    readyForProductionChat: readiness.readyForProductionChat,
    readyForProductionItinerary: readiness.readyForProductionItinerary,
    readyForProductionAI: readiness.readyForProductionAI,
    issues: readiness.issues,
    actionItems: getChatProviderReadinessActions(readiness),
  };

  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
    if (args.strict) {
      const failure = getChatProviderReadinessFailure(readiness);
      if (failure) {
        console.error(failure);
        process.exit(1);
      }
    }
    return;
  }

  console.log(
    [
      `Primary chat provider: ${summary.primary}`,
      `GLM configured: ${summary.glmConfigured ? "yes" : "no"}`,
      `GLM key source: ${summary.glmApiKeySource || "none"}`,
      `GLM model: ${summary.glmModel}`,
      `GLM base URL: ${summary.glmBaseUrl}`,
      `GLM health: ${
        summary.glmHealthChecked
          ? summary.glmHealthy
            ? "healthy"
            : "failed"
          : "not checked"
      }`,
      `Anthropic fallback configured: ${
        summary.anthropicFallbackConfigured ? "yes" : "no"
      }`,
      `Anthropic fallback model: ${summary.anthropicFallbackModel}`,
      `OpenAI itinerary fallback configured: ${
        summary.openaiItineraryFallbackConfigured ? "yes" : "no"
      }`,
      `OpenAI itinerary fallback model: ${summary.openaiItineraryFallbackModel}`,
      `Ready for GLM primary: ${summary.readyForGlmPrimary ? "yes" : "no"}`,
      `Ready for production chat: ${
        summary.readyForProductionChat ? "yes" : "no"
      }`,
      `Ready for production itineraries: ${
        summary.readyForProductionItinerary ? "yes" : "no"
      }`,
      `Ready for production AI: ${
        summary.readyForProductionAI ? "yes" : "no"
      }`,
      `Issues: ${summary.issues.length ? summary.issues.join(", ") : "none"}`,
      summary.actionItems.length
        ? `Next actions:\n${summary.actionItems.map((item) => `- ${item}`).join("\n")}`
        : "Next actions: none",
    ].join("\n")
  );

  if (args.strict) {
    const failure = getChatProviderReadinessFailure(readiness);
    if (failure) {
      console.error(failure);
      process.exit(1);
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
