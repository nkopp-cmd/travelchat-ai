import type { TextGenerationProvider } from '@/lib/llm/providers/base';
import { getTrimmedEnv, TEXT_MODEL } from '@/lib/llm/env';

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
  primaryProvider: 'openai';
  primaryModel: string;
  primaryConfigured: boolean;
}

export function getOpenAIItineraryFallbackModel(): string {
  return TEXT_MODEL;
}

export async function generateItineraryTextWithFallback(
  input: GenerateItineraryTextInput,
  dependencies: GenerateItineraryTextDependencies
): Promise<GenerateItineraryTextResult> {
  const model = dependencies.openaiModel ?? TEXT_MODEL;
  return {
    rawContent: await dependencies.generateWithOpenAI(input.systemPrompt, input.userPrompt),
    provider: 'openai',
    model,
    fallbackUsed: false,
    fallbackReason: null,
    primaryProvider: 'openai',
    primaryModel: model,
    primaryConfigured: Boolean(getTrimmedEnv('OPENAI_API_KEY')),
  };
}
