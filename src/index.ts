/**
 * react-native-llm-litert-mediapipe
 * React Native module for LiteRT/MediaPipe LLM inference
 *
 * Clean API for bare React Native (no Expo required)
 */

// Main hook and module exports
export { useLlm, LitertLlm, default } from "./LitertLlmModule";

// Functional API exports
export {
  loadModel,
  loadModelFromAsset,
  releaseModel,
  generateText,
  streamText,
  stopGeneration,
  generateStructuredOutput,
} from "./LlmApi";

// Type exports
export * from "./LlmApi.types";
export * from "./LitertLlm.types";

// Model Manager for download management
export { ModelManager, modelManager, type ModelInfo } from "./ModelManager";

// AI SDK Provider exports (for convenience, also available via /ai-sdk subpath)
export {
  createMediaPipeLlm,
  MediaPipeLlmLanguageModel,
  noopDownload,
  type MediaPipeLlmProvider,
  type MediaPipeLlmProviderSettings,
  type MediaPipeLlmModelId,
  type MediaPipeLlmModelSettings,
} from "./ai-sdk-provider";

// Polyfills for React Native compatibility with AI SDK
export {
  patchURLProtocol,
  needsURLProtocolPatch,
} from "./polyfills/patch-url-protocol";

export {
  patchReadableStreamAsyncIterator,
  needsReadableStreamAsyncIteratorPatch,
  makeAsyncIterable,
  streamToAsyncGenerator,
  type AsyncIterableStream,
} from "./polyfills/patch-readable-stream-async-iterator";
