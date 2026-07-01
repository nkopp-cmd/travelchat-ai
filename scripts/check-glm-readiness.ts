/**
 * Print GLM-first chat readiness without exposing provider secrets.
 *
 * Usage:
 *   npm run llm:readiness
 *   npm run llm:readiness -- --env-file=.env.local
 *   npm run llm:readiness -- --health
 */

import * as dotenv from "dotenv";
import { getChatProviderReadiness } from "../lib/llm/chat-readiness";

interface Args {
  envFile?: string;
  health: boolean;
  json: boolean;
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
    readyForGlmPrimary: readiness.readyForGlmPrimary,
    readyForProductionChat: readiness.readyForProductionChat,
    issues: readiness.issues,
  };

  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
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
      `Ready for GLM primary: ${summary.readyForGlmPrimary ? "yes" : "no"}`,
      `Ready for production chat: ${
        summary.readyForProductionChat ? "yes" : "no"
      }`,
      `Issues: ${summary.issues.length ? summary.issues.join(", ") : "none"}`,
    ].join("\n")
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
