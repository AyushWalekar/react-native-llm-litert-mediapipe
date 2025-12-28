/**
 * AI SDK compatible ModelMessage types for react-native-llm-litert-mediapipe
 * These types follow the AI SDK's ModelMessage format for interoperability
 */

export type TextPart = {
  type: "text";
  text: string;
};

export type ImagePart = {
  type: "image";
  image: string | Uint8Array | Buffer | ArrayBuffer;
  mediaType?: string;
};

export type FilePart = {
  type: "file";
  data: string | Uint8Array | Buffer | ArrayBuffer;
  mediaType: string;
  filename?: string;
};

export type ContentPart = TextPart | ImagePart | FilePart;

export type SystemModelMessage = {
  role: "system";
  content: string;
};

export type UserModelMessage = {
  role: "user";
  content: string | Array<ContentPart>;
};

export type AssistantModelMessage = {
  role: "assistant";
  content: string | Array<TextPart>;
};

export type ToolCallPart = {
  type: "tool-call";
  toolCallId: string;
  toolName: string;
  input: unknown;
};

export type ToolResultPart = {
  type: "tool-result";
  toolCallId: string;
  toolName: string;
  output: unknown;
  isError?: boolean;
};

export type ToolModelMessage = {
  role: "tool";
  content: Array<ToolResultPart>;
};

export type ModelMessage =
  | SystemModelMessage
  | UserModelMessage
  | AssistantModelMessage
  | ToolModelMessage;

/**
 * Text stream part for streaming responses
 */
export type TextStreamPart = {
  type: "text";
  text: string;
};

export type StreamPart = TextStreamPart;

/**
 * Configuration for loading an LLM model
 */
export interface LoadModelConfig {
  /** Maximum number of output tokens to generate */
  maxTokens?: number;
  /** Top-K sampling parameter */
  topK?: number;
  /** Temperature for randomness (0.0 to 1.0) */
  temperature?: number;
  /** Random seed for reproducible outputs */
  randomSeed?: number;
  /** Enable image input support (multimodal) */
  enableVisionModality?: boolean;
  /** Enable audio input support (multimodal) */
  enableAudioModality?: boolean;
  /** Maximum number of images per session */
  maxNumImages?: number;
}

/**
 * Options for generateText and streamText
 */
export interface GenerationOptions {
  /** Abort signal to cancel generation */
  abortSignal?: AbortSignal;
}

/**
 * Result from generateText
 */
export interface GenerateTextResult {
  /** The generated text */
  text: string;
  /** The finish reason ('stop', 'length', 'content-filter', 'tool-calls', 'error', 'other') */
  finishReason:
    | "stop"
    | "length"
    | "content-filter"
    | "tool-calls"
    | "error"
    | "other";
  /** Token usage information */
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
}

/**
 * Stream result from streamText
 */
export interface StreamTextResult {
  /** Async iterable stream of text parts */
  textStream: AsyncIterable<string>;
  /** Full text (consumes stream) */
  text: Promise<string>;
  /** Finish reason (consumes stream) */
  finishReason: Promise<
    "stop" | "length" | "content-filter" | "tool-calls" | "error" | "other"
  >;
  /** Consume the stream without processing parts */
  consumeStream: (options?: {
    onError?: (error: unknown) => void;
  }) => Promise<void>;
}

/**
 * Model instance returned by loadModel
 */
export interface LLMModel {
  /** Unique identifier for the model */
  id: string;
  /** Native model handle (internal use) */
  handle?: number;
  /** Whether the model is loaded and ready */
  isLoaded: boolean;
  /** Whether vision modality is enabled */
  enableVisionModality?: boolean;
  /** Whether audio modality is enabled */
  enableAudioModality?: boolean;
  /** Release the model resources */
  release: () => Promise<void>;
  /** Add an image to the session for multimodal inference */
  addImage?: (imagePath: string) => Promise<boolean>;
  /** Add audio to the session for multimodal inference */
  addAudio?: (audioPath: string) => Promise<boolean>;
}
