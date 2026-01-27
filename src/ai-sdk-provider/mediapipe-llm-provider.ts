/**
 * MediaPipe LLM Provider Factory
 *
 * Creates an AI SDK V3 compatible provider for on-device LLM inference
 * using LiteRT/MediaPipe models.
 */

import type { LanguageModelV3 } from "@ai-sdk/provider";
import type { LoadModelConfig } from "../LlmApi.types";
import { MediaPipeLlmLanguageModel } from "./mediapipe-llm-language-model";
import type {
  MediaPipeLlmModelId,
  MediaPipeLlmModelSettings,
} from "./mediapipe-llm-settings";

/**
 * Provider settings for MediaPipe LLM
 */
export interface MediaPipeLlmProviderSettings {
  /**
   * Path to the LiteRT model file.
   * Example: '/data/user/0/.../gemma-3n.litertlm'
   */
  modelPath?: string;

  /**
   * Asset name for loading model from Android assets.
   * Only used if modelPath is not provided.
   * Example: 'gemma-3n-E4B-it-int4.litertlm'
   */
  modelName?: string;

  /**
   * Default model configuration.
   * Individual models can override these settings.
   */
  config?: LoadModelConfig;

  /**
   * Whether to preload the model immediately.
   * Default: false (lazy loading on first use)
   *
   * Set to true for faster first inference, but slower initialization.
   */
  preload?: boolean;
}

/**
 * MediaPipe LLM Provider interface
 *
 * Can be called as a function to get a language model,
 * or use the languageModel() method.
 */
export interface MediaPipeLlmProvider {
  /**
   * Get a language model instance.
   * @param modelId Logical model identifier (e.g., 'gemma-3n')
   * @param settings Optional per-model settings
   */
  (
    modelId: MediaPipeLlmModelId,
    settings?: MediaPipeLlmModelSettings,
  ): LanguageModelV3;

  /**
   * Get a language model instance (alternative method).
   * @param modelId Logical model identifier
   * @param settings Optional per-model settings
   */
  languageModel(
    modelId: MediaPipeLlmModelId,
    settings?: MediaPipeLlmModelSettings,
  ): LanguageModelV3;

  /**
   * Preload the default model for faster first inference.
   * Returns a promise that resolves when the model is loaded.
   */
  preload(): Promise<void>;

  /**
   * Release all loaded models to free memory.
   */
  releaseAll(): Promise<void>;
}

/**
 * Create a MediaPipe LLM provider for on-device inference.
 *
 * @example
 * ```typescript
 * import { generateText, streamText } from 'ai';
 * import { createMediaPipeLlm } from 'react-native-llm-litert-mediapipe/ai-sdk';
 *
 * // Create provider with model path
 * const mediapipe = createMediaPipeLlm({
 *   modelPath: '/path/to/gemma-3n.litertlm',
 *   config: {
 *     maxTokens: 1024,
 *     temperature: 0.8,
 *     enableVisionModality: true, // Android only
 *   }
 * });
 *
 * // Use with AI SDK generateText
 * const result = await generateText({
 *   model: mediapipe('gemma-3n'),
 *   prompt: 'Hello, world!'
 * });
 *
 * // Use with AI SDK streamText
 * const stream = await streamText({
 *   model: mediapipe('gemma-3n'),
 *   messages: [
 *     { role: 'user', content: 'Tell me a story' }
 *   ]
 * });
 *
 * for await (const text of stream.textStream) {
 *   console.log(text);
 * }
 *
 * // Structured output with schema
 * import { Output } from 'ai';
 * import { z } from 'zod';
 *
 * const result = await generateText({
 *   model: mediapipe('gemma-3n'),
 *   output: Output.object({
 *     schema: z.object({
 *       sentiment: z.enum(['positive', 'negative', 'neutral']),
 *       confidence: z.number(),
 *     })
 *   }),
 *   prompt: 'Analyze: "I love this!"'
 * });
 * ```
 *
 * @param settings Provider configuration
 * @returns MediaPipe LLM provider
 */
export function createMediaPipeLlm(
  settings: MediaPipeLlmProviderSettings = {},
): MediaPipeLlmProvider {
  // Cache for model instances to support lazy loading and reuse
  const modelCache = new Map<string, MediaPipeLlmLanguageModel>();

  /**
   * Get or create a language model instance
   */
  const getModel = (
    modelId: MediaPipeLlmModelId,
    modelSettings?: MediaPipeLlmModelSettings,
  ): MediaPipeLlmLanguageModel => {
    // Create cache key from modelId and settings
    const cacheKey = `${modelId}:${JSON.stringify(modelSettings || {})}`;

    // Return cached model if available
    let model = modelCache.get(cacheKey);
    if (model) {
      return model;
    }

    // Merge provider settings with model-specific settings
    const mergedConfig: LoadModelConfig = {
      ...settings.config,
      ...modelSettings?.config,
    };

    const mergedSettings = {
      modelPath: modelSettings?.modelPath || settings.modelPath,
      modelName: modelSettings?.modelName || settings.modelName,
      config: mergedConfig,
      preload: modelSettings?.preload ?? settings.preload ?? false,
    };

    // Create new model instance
    model = new MediaPipeLlmLanguageModel(modelId, mergedSettings);
    modelCache.set(cacheKey, model);

    return model;
  };

  // Create the callable provider function with methods attached
  const callableProvider = (
    modelId: MediaPipeLlmModelId,
    modelSettings?: MediaPipeLlmModelSettings,
  ): LanguageModelV3 => {
    return getModel(modelId, modelSettings);
  };

  // languageModel method
  const languageModel = (
    modelId: MediaPipeLlmModelId,
    modelSettings?: MediaPipeLlmModelSettings,
  ): LanguageModelV3 => {
    return getModel(modelId, modelSettings);
  };

  // preload method
  const preload = async (): Promise<void> => {
    const defaultModel = getModel("default" as MediaPipeLlmModelId);
    await defaultModel.preload();
  };

  // releaseAll method
  const releaseAll = async (): Promise<void> => {
    const releasePromises: Promise<void>[] = [];
    for (const model of modelCache.values()) {
      releasePromises.push(model.release());
    }
    await Promise.all(releasePromises);
    modelCache.clear();
  };

  // Create the provider with all methods
  const provider: MediaPipeLlmProvider = Object.assign(callableProvider, {
    languageModel,
    preload,
    releaseAll,
  });

  return provider;
}
