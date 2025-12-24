/**
 * react-native-llm-litert-mediapipe
 * Bare React Native module for MediaPipe LLM inference (no Expo required)
 *
 * Provides OpenAI-compatible / llama.rn-style API for:
 * - Chat completion with message arrays
 * - Multimodal input (images, audio)
 * - Streaming responses
 */
import MediaPipeLlm, {
  generateStreamingText,
  useLLM,
} from "./MediaPipeLlmModule";

// Default export - the native module
export default MediaPipeLlm;

// Named exports - hooks and utilities
export { generateStreamingText, useLLM };

// Model management
export { ModelManager, modelManager } from "./ModelManagerBare";

// Chat formatting utilities
export {
  formatChatMessages,
  detectTemplate,
  hasMultimodalContent,
  validateMediaPaths,
  GEMMA_TEMPLATE,
  SIMPLE_TEMPLATE,
  CHATML_TEMPLATE,
  type ChatTemplate,
  type FormattedChat,
  type ExtractedMedia,
} from "./utils/chatFormatter";

// All types
export * from "./MediaPipeLlm.types";
