/**
 * Types for react-native-llm-litert-mediapipe
 * Shared types for the LiteRT LLM module
 */

// Event payload types
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
  handle?: number;
  message: string;
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

// Module events interface
export type LitertLlmModuleEvents = {
  onChange: (params: { value: string }) => void;
  onPartialResponse: (params: PartialResponseEventPayload) => void;
  onErrorResponse: (params: ErrorResponseEventPayload) => void;
  logging: (params: LoggingEventPayload) => void;
  downloadProgress: (params: DownloadProgressEvent) => void;
};

// Download options
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

// Subscription interface
export interface NativeModuleSubscription {
  remove(): void;
}

/**
 * Native module interface
 */
export interface LitertLlmModuleInterface {
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

  /**
   * Releases a model and frees resources.
   */
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
   * Stop ongoing generation for a model
   */
  stopGeneration(handle: number): Promise<boolean>;

  /**
   * Generate structured output using tool calling.
   * The model will be forced to call a tool with parameters matching the provided JSON schema.
   * Only supported with LiteRT-LM models (.litertlm files).
   *
   * @param handle Model handle
   * @param requestId Request identifier for tracking
   * @param prompt The user prompt
   * @param outputSchema JSON Schema string defining the expected output structure
   * @param systemPrompt Optional custom system prompt (empty string uses default)
   * @returns JSON string containing the structured output matching the schema
   */
  generateStructuredOutput(
    handle: number,
    requestId: number,
    prompt: string,
    outputSchema: string,
    systemPrompt?: string
  ): Promise<string>;

  /**
   * Adds a listener for a specific event.
   */
  addListener<EventName extends keyof LitertLlmModuleEvents>(
    eventName: EventName,
    listener: LitertLlmModuleEvents[EventName]
  ): NativeModuleSubscription;

  /**
   * Removes all listeners for a specific event.
   */
  removeAllListeners(event: keyof LitertLlmModuleEvents): void;
}

// Legacy type aliases for backwards compatibility
export type ExpoLlmMediapipeModuleEvents = LitertLlmModuleEvents;
export type ExpoLlmMediapipeModule = LitertLlmModuleInterface;
