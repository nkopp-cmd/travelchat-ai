import { GLMProvider } from '@/lib/llm';
import type { TextGenerationProvider } from '@/lib/llm/providers/base';

export type ItineraryTextProviderName = 'glm' | 'openai';

interface GenerateItineraryTextInput {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
}

interface GenerateItineraryTextDependencies {
  glm?: Pick<TextGenerationProvider, 'isAvailable' | 'generateText'>;
  generateWithOpenAI: (systemPrompt: string, userPrompt: string) => Promise<string>;
  logger?: Pick<Console, 'error'>;
}

interface GenerateItineraryTextResult {
  rawContent: string;
  provider: ItineraryTextProviderName;
  fallbackUsed: boolean;
}

export async function generateItineraryTextWithFallback(
  input: GenerateItineraryTextInput,
  dependencies: GenerateItineraryTextDependencies
): Promise<GenerateItineraryTextResult> {
  const glm = dependencies.glm ?? new GLMProvider();
  let glmWasAttempted = false;

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
        throw new Error('GLM returned an empty itinerary response');
      }

      return {
        rawContent,
        provider: 'glm',
        fallbackUsed: false,
      };
    } catch (glmError) {
      (dependencies.logger ?? console).error(
        '[generate] GLM primary failed; falling back to OpenAI:',
        glmError
      );
    }
  }

  return {
    rawContent: await dependencies.generateWithOpenAI(input.systemPrompt, input.userPrompt),
    provider: 'openai',
    fallbackUsed: glmWasAttempted,
  };
}
