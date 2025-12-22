/**
 * Itinerary Generation Hook
 *
 * Provides itinerary generation with:
 * - V2 endpoint with multi-LLM orchestration (when enabled)
 * - V1 fallback for reliability
 * - Streaming support for real-time progress
 * - Error handling with automatic retry
 */

import { useState, useCallback, useRef } from 'react';

// ============================================================================
// Types
// ============================================================================

export interface ItineraryParams {
  city: string;
  days: number;
  interests: string[];
  budget: string;
  localnessLevel: number;
  pace: string;
  groupType: string;
  templatePrompt?: string;
}

export interface GenerationProgress {
  status: 'idle' | 'starting' | 'generating' | 'validating' | 'saving' | 'complete' | 'error';
  message: string;
  progress: number;
  phase?: 'phase1' | 'phase2';
  qualityScore?: number;
}

export interface GeneratedItinerary {
  id?: string;
  title: string;
  subtitle: string;
  city: string;
  days: number;
  localScore: number;
  estimatedCost: string;
  highlights: string[];
  dailyPlans: DailyPlan[];
}

export interface DailyPlan {
  day: number;
  theme: string;
  activities: Activity[];
  localTip: string;
  transportTips: string;
}

export interface Activity {
  time: string;
  type: 'morning' | 'afternoon' | 'evening';
  name: string;
  address: string;
  description: string;
  category: string;
  localleyScore: number;
  duration: string;
  cost: string;
  image?: string;
}

export interface GenerationMeta {
  qualityScore?: number | null;
  validationReport?: unknown;
  fallbackUsed?: string;
  metrics?: {
    totalLatencyMs: number;
    providersUsed: string[];
    cacheHits: number;
  };
}

export interface GenerationResult {
  success: boolean;
  itinerary?: GeneratedItinerary;
  meta?: GenerationMeta;
  error?: string;
}

export interface UseItineraryGenerationOptions {
  useV2?: boolean;
  useStreaming?: boolean;
  onProgress?: (progress: GenerationProgress) => void;
}

// ============================================================================
// Hook
// ============================================================================

export function useItineraryGeneration(options: UseItineraryGenerationOptions = {}) {
  const { useV2 = true, useStreaming = false, onProgress } = options;

  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<GenerationProgress>({
    status: 'idle',
    message: '',
    progress: 0,
  });
  const [result, setResult] = useState<GenerationResult | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const updateProgress = useCallback((newProgress: Partial<GenerationProgress>) => {
    setProgress(prev => {
      const updated = { ...prev, ...newProgress };
      onProgress?.(updated);
      return updated;
    });
  }, [onProgress]);

  /**
   * Generate itinerary using streaming endpoint
   */
  const generateWithStreaming = useCallback(async (params: ItineraryParams): Promise<GenerationResult> => {
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch('/api/itineraries/generate-v2/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        signal: controller.signal,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to generate itinerary');
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let finalResult: GenerationResult | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6));

              switch (event.type) {
                case 'start':
                  updateProgress({
                    status: 'starting',
                    message: event.data.message,
                    progress: 5,
                  });
                  break;

                case 'progress':
                  updateProgress({
                    status: 'generating',
                    message: event.data.message,
                    progress: event.data.progress,
                  });
                  break;

                case 'phase1':
                  updateProgress({
                    status: 'generating',
                    message: event.data.message,
                    progress: event.data.progress,
                    phase: 'phase1',
                  });
                  break;

                case 'phase2':
                  updateProgress({
                    status: 'validating',
                    message: event.data.message,
                    progress: event.data.progress,
                    phase: 'phase2',
                    qualityScore: event.data.qualityScore,
                  });
                  break;

                case 'complete':
                  updateProgress({
                    status: 'complete',
                    message: 'Itinerary ready!',
                    progress: 100,
                  });
                  finalResult = {
                    success: true,
                    itinerary: event.data.itinerary,
                    meta: event.data.meta,
                  };
                  break;

                case 'error':
                  updateProgress({
                    status: 'error',
                    message: event.data.error || 'Generation failed',
                    progress: 0,
                  });
                  finalResult = {
                    success: false,
                    error: event.data.error || event.data.message,
                  };
                  break;
              }
            } catch {
              // Ignore parse errors for incomplete chunks
            }
          }
        }
      }

      return finalResult || { success: false, error: 'No result received' };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return { success: false, error: 'Generation cancelled' };
      }
      throw error;
    }
  }, [updateProgress]);

  /**
   * Generate itinerary using standard endpoint
   */
  const generateStandard = useCallback(async (params: ItineraryParams, endpoint: string): Promise<GenerationResult> => {
    const controller = new AbortController();
    abortControllerRef.current = controller;

    updateProgress({
      status: 'generating',
      message: 'Generating your itinerary...',
      progress: 30,
    });

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || error.message || 'Failed to generate itinerary');
    }

    updateProgress({
      status: 'saving',
      message: 'Finalizing...',
      progress: 90,
    });

    const data = await response.json();

    updateProgress({
      status: 'complete',
      message: 'Itinerary ready!',
      progress: 100,
    });

    return {
      success: true,
      itinerary: data.itinerary,
      meta: data.meta,
    };
  }, [updateProgress]);

  /**
   * Main generate function
   */
  const generate = useCallback(async (params: ItineraryParams): Promise<GenerationResult> => {
    setIsGenerating(true);
    setResult(null);

    updateProgress({
      status: 'starting',
      message: 'Starting generation...',
      progress: 0,
    });

    try {
      let generationResult: GenerationResult;

      if (useStreaming && useV2) {
        // Try streaming V2
        generationResult = await generateWithStreaming(params);
      } else if (useV2) {
        // Try standard V2
        try {
          generationResult = await generateStandard(params, '/api/itineraries/generate-v2');
        } catch (v2Error) {
          console.warn('V2 failed, falling back to V1:', v2Error);
          // Fallback to V1
          generationResult = await generateStandard(params, '/api/itineraries/generate');
        }
      } else {
        // Use V1 directly
        generationResult = await generateStandard(params, '/api/itineraries/generate');
      }

      setResult(generationResult);
      return generationResult;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Generation failed';

      updateProgress({
        status: 'error',
        message: errorMessage,
        progress: 0,
      });

      const errorResult: GenerationResult = {
        success: false,
        error: errorMessage,
      };
      setResult(errorResult);
      return errorResult;
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  }, [useV2, useStreaming, generateWithStreaming, generateStandard, updateProgress]);

  /**
   * Cancel ongoing generation
   */
  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsGenerating(false);
    updateProgress({
      status: 'idle',
      message: 'Cancelled',
      progress: 0,
    });
  }, [updateProgress]);

  /**
   * Reset state
   */
  const reset = useCallback(() => {
    setIsGenerating(false);
    setProgress({
      status: 'idle',
      message: '',
      progress: 0,
    });
    setResult(null);
  }, []);

  return {
    generate,
    cancel,
    reset,
    isGenerating,
    progress,
    result,
  };
}

// ============================================================================
// Utility: Check V2 endpoint availability
// ============================================================================

export async function checkV2Available(): Promise<boolean> {
  try {
    const response = await fetch('/api/itineraries/generate-v2', {
      method: 'GET',
    });

    if (!response.ok) return false;

    const data = await response.json();
    return data.status === 'ok' && data.multiLLMEnabled;
  } catch {
    return false;
  }
}
