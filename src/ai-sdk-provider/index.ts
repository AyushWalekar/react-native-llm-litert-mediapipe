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

/**
 * Download function that skips all downloads for local file handling.
 *
 * Use this with AI SDK's experimental_download option when using local files
 * (images, audio) with the MediaPipe LLM provider. This prevents AI SDK from
 * attempting to fetch local file:// or content:// URLs, which would fail
 * in React Native since these protocols aren't HTTP-fetchable.
 *
 * @example
 * ```typescript
 * import { generateText } from 'ai';
 * import { createMediaPipeLlm, noopDownload } from 'react-native-llm-litert-mediapipe';
 *
 * const mediapipe = createMediaPipeLlm({ modelPath: '...' });
 *
 * const result = await generateText({
 *   model: mediapipe('gemma-3n'),
 *   messages: [
 *     { role: 'user', content: [
 *       { type: 'image', image: '/path/to/image.jpg', mediaType: 'image/jpeg' },
 *       { type: 'text', text: 'What is in this image?' }
 *     ]}
 *   ],
 *   experimental_download: noopDownload,
 * });
 * ```
 */
export const noopDownload = async (
  requestedDownloads: Array<{ url: URL; isUrlSupportedByModel: boolean }>,
): Promise<
  Array<{ data: Uint8Array; mediaType: string | undefined } | null>
> => {
  // Return null for all URLs - the MediaPipe provider handles local files natively
  // Returning null tells AI SDK to pass the URL through as-is without downloading
  return requestedDownloads.map(() => null);
};
