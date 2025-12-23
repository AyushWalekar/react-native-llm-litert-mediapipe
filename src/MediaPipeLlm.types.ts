/**
 * Types for react-native-llm-litert-mediapipe
 * Shared between Expo and bare React Native implementations
 */

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
  generateResponse: (
    promptText: string,
    onPartial?: (partial: string, reqId: number | undefined) => void,
    onErrorCb?: (message: string, reqId: number | undefined) => void,
    abortSignal?: AbortSignal
  ) => Promise<string>;
  generateStreamingResponse: (
    promptText: string,
    onPartial?: (partial: string, reqId: number) => void,
    onErrorCb?: (message: string, reqId: number) => void,
    abortSignal?: AbortSignal
  ) => Promise<void>;
  /**
   * Add an image to the current session (Android only)
   * @param imagePath - File path to the image (supports file:// URIs)
   */
  addImage: (imagePath: string) => Promise<boolean>;
  /**
   * Add audio to the current session (Android only, must be mono WAV)
   * @param audioPath - File path to the audio file (supports file:// URIs)
   */
  addAudio: (audioPath: string) => Promise<boolean>;
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
