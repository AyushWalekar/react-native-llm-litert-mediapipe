/**
 * Types for react-native-llm-litert-mediapipe
 * Shared between Expo and bare React Native implementations
 *
 * Provides OpenAI-compatible and llama.rn-style interfaces for:
 * - Chat completion with message arrays
 * - Multimodal input (images, audio)
 * - Streaming responses
 */

// ============================================================================
// OpenAI-Compatible Chat Types (llama.rn style)
// ============================================================================

/**
 * Role of a message in the conversation
 */
export type MessageRole = "system" | "user" | "assistant";

/**
 * Text content part
 */
export interface TextContentPart {
  type: "text";
  text: string;
}

/**
 * Image content part (OpenAI vision API compatible)
 */
export interface ImageContentPart {
  type: "image_url";
  image_url: {
    /** File path (file://), base64 data URL, or http URL */
    url: string;
  };
}

/**
 * Audio content part (OpenAI audio API compatible)
 */
export interface AudioContentPart {
  type: "input_audio";
  input_audio: {
    /** File path (file://), base64 data URL */
    url?: string;
    /** Base64 encoded audio data */
    data?: string;
    /** Audio format */
    format?: "wav" | "mp3";
  };
}

/**
 * Content can be a simple string or an array of content parts (for multimodal)
 */
export type MessageContent =
  | string
  | (TextContentPart | ImageContentPart | AudioContentPart)[];

/**
 * A chat message in OpenAI format
 */
export interface ChatMessage {
  role: MessageRole;
  content: MessageContent;
  /** Optional name for the message author */
  name?: string;
}

/**
 * Options for chat completion (OpenAI-compatible)
 */
export interface CompletionOptions {
  /** Array of messages comprising the conversation */
  messages: ChatMessage[];
  /** Maximum tokens to generate */
  maxTokens?: number;
  /** Sampling temperature (0-2) */
  temperature?: number;
  /** Top-K sampling */
  topK?: number;
  /** Top-P (nucleus) sampling */
  topP?: number;
  /** Stop sequences - generation stops when these are encountered */
  stop?: string[];
  /** Response format constraint */
  responseFormat?: {
    type: "text" | "json_object";
  };
  /** Whether to stream the response */
  stream?: boolean;
}

/**
 * Token data during streaming
 */
export interface TokenData {
  /** The token string */
  token: string;
  /** Accumulated text so far */
  text: string;
}

/**
 * Callback for streaming tokens
 */
export type StreamCallback = (data: TokenData) => void;

/**
 * Result of a chat completion
 */
export interface CompletionResult {
  /** The generated text */
  text: string;
  /** Why generation stopped */
  finishReason: "stop" | "length" | "error";
  /** Token usage statistics (if available) */
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Model information
 */
export interface ModelInfo {
  /** Model file name */
  name: string;
  /** Whether the model supports vision/image input */
  supportsVision: boolean;
  /** Whether the model supports audio input */
  supportsAudio: boolean;
  /** Model type */
  type: "mediapipe" | "litertlm" | "unknown";
}

// ============================================================================
// Original Types (maintained for backward compatibility)
// ============================================================================

export type OnLoadEventPayload = {
  url: string;
};

export type ExpoLlmMediapipeModuleEvents = {
  onChange: (params: ChangeEventPayload) => void;
  onPartialResponse: (params: PartialResponseEventPayload) => void;
  onErrorResponse: (params: ErrorResponseEventPayload) => void;
  logging: (params: LoggingEventPayload) => void;
  downloadProgress: (params: DownloadProgressEvent) => void;
};

export type ChangeEventPayload = {
  value: string;
};

export type PartialResponseEventPayload = {
  handle: number;
  requestId: number;
  response: string;
};

export type ErrorResponseEventPayload = {
  handle: number;
  requestId: number;
  error: string;
};

export type LoggingEventPayload = {
  handle: number;
  message: string;
};

// LLM Types and Hook
type LlmModelLocation =
  | { storageType: "asset"; modelName: string }
  | { storageType: "file"; modelPath: string };

export type LlmInferenceConfig = LlmModelLocation & {
  maxTokens?: number;
  topK?: number;
  temperature?: number;
  randomSeed?: number;
};

export interface DownloadProgressEvent {
  modelName: string;
  url?: string;
  bytesDownloaded?: number;
  totalBytes?: number;
  progress?: number;
  status: "downloading" | "completed" | "error" | "cancelled";
  error?: string;
}

export interface DownloadOptions {
  overwrite?: boolean;
  timeout?: number;
  headers?: Record<string, string>;
}

/**
 * Options for enabling multimodal (image/audio) support
 * Note: Multimodal is only supported on Android with compatible models (e.g., Gemma 3n)
 */
export interface MultimodalOptions {
  /** Enable image input support */
  enableVisionModality?: boolean;
  /** Enable audio input support */
  enableAudioModality?: boolean;
  /** Maximum number of images per session (default: 10) */
  maxNumImages?: number;
}

type BaseLlmParams = {
  maxTokens?: number;
  topK?: number;
  temperature?: number;
  randomSeed?: number;
} & MultimodalOptions;

/**
 * Props for the `useLLM` hook.
 * - If `modelUrl` is provided, `modelName` is also required for downloadable models.
 * - Otherwise, `storageType` and either `modelName` (for assets) or `modelPath` (for files) are required.
 */
export type UseLLMProps = BaseLlmParams &
  (
    | {
        modelUrl?: undefined;
        storageType: "asset";
        modelName: string;
        modelPath?: undefined;
      }
    | {
        modelUrl?: undefined;
        storageType: "file";
        modelPath: string;
        modelName?: undefined;
      }
    | {
        modelUrl: string;
        modelName: string;
        storageType?: undefined;
        modelPath?: undefined;
      }
  );

// Specific prop types for hook overloads
export type UseLLMAssetProps = BaseLlmParams & {
  modelUrl?: undefined;
  storageType: "asset";
  modelName: string;
  modelPath?: undefined;
};
export type UseLLMFileProps = BaseLlmParams & {
  modelUrl?: undefined;
  storageType: "file";
  modelPath: string;
  modelName?: undefined;
};
export type UseLLMDownloadableProps = BaseLlmParams & {
  modelUrl: string;
  modelName: string;
  storageType?: undefined;
  modelPath?: undefined;
};

// Return types for the useLLM hook
export interface BaseLlmReturn {
  // =========================================================================
  // OpenAI-compatible / llama.rn-style API (RECOMMENDED)
  // =========================================================================

  /**
   * Chat completion with OpenAI-compatible message format.
   * Supports multimodal content (images, audio) in message content arrays.
   *
   * @example
   * ```typescript
   * // Text-only chat
   * const result = await completion({
   *   messages: [
   *     { role: 'system', content: 'You are a helpful assistant.' },
   *     { role: 'user', content: 'Hello!' }
   *   ]
   * });
   *
   * // Multimodal chat with image
   * const result = await completion({
   *   messages: [{
   *     role: 'user',
   *     content: [
   *       { type: 'text', text: 'What is in this image?' },
   *       { type: 'image_url', image_url: { url: 'file:///path/to/image.jpg' } }
   *     ]
   *   }]
   * });
   * ```
   */
  completion: (
    options: CompletionOptions,
    onToken?: StreamCallback,
    abortSignal?: AbortSignal
  ) => Promise<CompletionResult>;

  /**
   * Clear the current conversation context/session.
   * Call this to start a fresh conversation.
   */
  clearContext: () => Promise<void>;

  /**
   * Get information about the loaded model.
   */
  getModelInfo: () => ModelInfo | null;

  // =========================================================================
  // Legacy API (maintained for backward compatibility)
  // =========================================================================

  /** @deprecated Use completion() instead */
  generateResponse: (
    promptText: string,
    onPartial?: (partial: string, reqId: number | undefined) => void,
    onErrorCb?: (message: string, reqId: number | undefined) => void,
    abortSignal?: AbortSignal
  ) => Promise<string>;

  /** @deprecated Use completion() with stream callback instead */
  generateStreamingResponse: (
    promptText: string,
    onPartial?: (partial: string, reqId: number) => void,
    onErrorCb?: (message: string, reqId: number) => void,
    abortSignal?: AbortSignal
  ) => Promise<void>;

  /**
   * Add an image to the current session (Android only)
   * @deprecated Use completion() with image_url content parts instead
   * @param imagePath - File path to the image (supports file:// URIs)
   */
  addImage: (imagePath: string) => Promise<boolean>;

  /**
   * Add audio to the current session (Android only, must be mono WAV)
   * @deprecated Use completion() with input_audio content parts instead
   * @param audioPath - File path to the audio file (supports file:// URIs)
   */
  addAudio: (audioPath: string) => Promise<boolean>;

  /** Whether the model is loaded and ready */
  isLoaded: boolean;
}

export interface DownloadableLlmReturn extends BaseLlmReturn {
  downloadModel: (options?: DownloadOptions) => Promise<boolean>;
  loadModel: () => Promise<void>;
  downloadStatus: "not_downloaded" | "downloading" | "downloaded" | "error";
  downloadProgress: number;
  downloadError: string | null;
  isCheckingStatus: boolean;
}

export interface NativeModuleSubscription {
  remove(): void;
}

export interface ExpoLlmMediapipeModule {
  /**
   * Creates a model from a file path.
   */
  createModel(
    modelPath: string,
    maxTokens: number,
    topK: number,
    temperature: number,
    randomSeed: number,
    options?: MultimodalOptions
  ): Promise<number>;

  /**
   * Creates a model from an asset.
   */
  createModelFromAsset(
    modelName: string,
    maxTokens: number,
    topK: number,
    temperature: number,
    randomSeed: number,
    options?: MultimodalOptions
  ): Promise<number>;

  releaseModel(handle: number): Promise<boolean>;

  /**
   * Generates a response based on the provided prompt.
   */
  generateResponse(
    handle: number,
    requestId: number,
    prompt: string
  ): Promise<string>;

  /**
   * Generates a response asynchronously based on the provided prompt.
   */
  generateResponseAsync(
    handle: number,
    requestId: number,
    prompt: string
  ): Promise<boolean>;

  /**
   * Checks if a model is downloaded.
   */
  isModelDownloaded(modelName: string): Promise<boolean>;

  /**
   * Lists all downloaded models.
   */
  getDownloadedModels(): Promise<string[]>;

  /**
   * Deletes a downloaded model.
   */
  deleteDownloadedModel(modelName: string): Promise<boolean>;

  /**
   * Downloads a model from a given URL.
   */
  downloadModel(
    url: string,
    modelName: string,
    options?: DownloadOptions
  ): Promise<boolean>;

  /**
   * Cancels a model download.
   */
  cancelDownload(modelName: string): Promise<boolean>;

  /**
   * Creates a model from a downloaded file.
   */
  createModelFromDownloaded(
    modelName: string,
    maxTokens?: number,
    topK?: number,
    temperature?: number,
    randomSeed?: number,
    options?: MultimodalOptions
  ): Promise<number>;

  /**
   * Adds an image to the current session (Android only)
   */
  addImageToSession(handle: number, imagePath: string): Promise<boolean>;

  /**
   * Adds audio to the current session (Android only, must be mono WAV)
   */
  addAudioToSession(handle: number, audioPath: string): Promise<boolean>;

  /**
   * Clears the current session/conversation context.
   * Creates a fresh session while keeping the model loaded.
   */
  clearSession(handle: number): Promise<boolean>;

  /**
   * Adds a listener for a specific event.
   */
  addListener<EventName extends keyof ExpoLlmMediapipeModuleEvents>(
    eventName: EventName,
    listener: ExpoLlmMediapipeModuleEvents[EventName]
  ): NativeModuleSubscription;

  /**
   * Removes all listeners for a specific event.
   */
  removeAllListeners(event: keyof ExpoLlmMediapipeModuleEvents): void;
}
