/**
 * AI SDK Custom Provider for LiteRT-LLM
 *
 * This module provides an AI SDK V3-compatible provider that wraps
 * the native LiteRT/MediaPipe LLM bridge, allowing on-device inference
 * using the standard AI SDK interface.
 *
 * @example
 * ```typescript
 * import { generateText, streamText } from 'ai';
 * import { createMediaPipeLlm } from 'react-native-llm-litert-mediapipe/ai-sdk';
 *
 * const mediapipe = createMediaPipeLlm({
 *   modelPath: '/path/to/model.litertlm',
 *   config: { maxTokens: 1024, temperature: 0.8 }
 * });
 *
 * const result = await generateText({
 *   model: mediapipe('gemma-3n'),
 *   prompt: 'Hello!'
 * });
 * ```
 */

export {
  createMediaPipeLlm,
  type MediaPipeLlmProvider,
  type MediaPipeLlmProviderSettings,
} from "./mediapipe-llm-provider";

export { MediaPipeLlmLanguageModel } from "./mediapipe-llm-language-model";

export type {
  MediaPipeLlmModelId,
  MediaPipeLlmModelSettings,
} from "./mediapipe-llm-settings";

// Re-export AI SDK types from @ai-sdk/provider for convenience
export type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3Prompt,
  LanguageModelV3Message,
  LanguageModelV3FinishReason,
  LanguageModelV3StreamPart,
  LanguageModelV3Usage,
} from "@ai-sdk/provider";
