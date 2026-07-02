import { GLMProvider } from '@/lib/llm';
import type { TextGenerationProvider } from '@/lib/llm/providers/base';
import { getTrimmedEnv, readGLMProviderConfig } from '@/lib/llm/env';

export type ItineraryTextProviderName = 'glm' | 'openai';
export type ItineraryFallbackReason =
  | 'glm_unavailable'
  | 'glm_error'
  | 'glm_empty_response'
  | 'glm_invalid_json'
  | null;

interface GenerateItineraryTextInput {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
}

interface GenerateItineraryTextDependencies {
  glm?: Pick<TextGenerationProvider, 'isAvailable' | 'generateText'>;
  generateWithOpenAI: (systemPrompt: string, userPrompt: string) => Promise<string>;
  openaiModel?: string;
  logger?: Pick<Console, 'error'>;
}

interface GenerateItineraryTextResult {
  rawContent: string;
  provider: ItineraryTextProviderName;
  model: string;
  fallbackUsed: boolean;
  fallbackReason: ItineraryFallbackReason;
  primaryProvider: 'glm';
  primaryModel: string;
  primaryConfigured: boolean;
}

export function getOpenAIItineraryFallbackModel(): string {
  return getTrimmedEnv('OPENAI_MODEL') || 'gpt-4o';
}

export async function generateItineraryTextWithFallback(
  input: GenerateItineraryTextInput,
  dependencies: GenerateItineraryTextDependencies
): Promise<GenerateItineraryTextResult> {
  const glm = dependencies.glm ?? new GLMProvider();
  const primaryModel = readGLMProviderConfig().model;
  const openaiModel =
    dependencies.openaiModel ?? getOpenAIItineraryFallbackModel();
  let glmWasAttempted = false;
  let fallbackReason: ItineraryFallbackReason = null;

  if (glm.isAvailable()) {
    glmWasAttempted = true;

    try {
      const response = await glm.generateText({
        systemPrompt: input.systemPrompt,
        userPrompt: input.userPrompt,
        responseFormat: 'json',
        temperature: input.temperature ?? 0.8,
        maxTokens: input.maxTokens ?? 3000,
      });
      const rawContent = response.content.trim();

      if (!rawContent) {
        fallbackReason = 'glm_empty_response';
        throw new Error('GLM returned an empty itinerary response');
      }

      return {
        rawContent,
        provider: 'glm',
        model: primaryModel,
        fallbackUsed: false,
        fallbackReason: null,
        primaryProvider: 'glm',
        primaryModel,
        primaryConfigured: true,
      };
    } catch (glmError) {
      fallbackReason = fallbackReason || 'glm_error';
      (dependencies.logger ?? console).error(
        '[generate] GLM primary failed; falling back to OpenAI:',
        glmError
      );
    }
  } else {
    fallbackReason = 'glm_unavailable';
  }

  return {
    rawContent: await dependencies.generateWithOpenAI(input.systemPrompt, input.userPrompt),
    provider: 'openai',
    model: openaiModel,
    fallbackUsed: glmWasAttempted,
    fallbackReason,
    primaryProvider: 'glm',
    primaryModel,
    primaryConfigured: glmWasAttempted,
  };
}
