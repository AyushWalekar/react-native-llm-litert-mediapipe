/**
 * Standardized LLM API - AI SDK compatible interface
 * Provides loadModel, releaseModel, generateText, streamText, stopGeneration
 */

import LitertLlm from "./NativeLitertLlm";
import {
  ModelMessage,
  LoadModelConfig,
  GenerationOptions,
  GenerateTextResult,
  StreamTextResult,
  LLMModel,
} from "./LlmApi.types";
import type { MultimodalOptions } from "./LitertLlm.types";
import type {
  PartialResponseEventPayload,
  ErrorResponseEventPayload,
} from "./LitertLlm.types";

let nextModelId = 1;

// Counter for request IDs - must fit in 32-bit signed integer range
let nextRequestId = 1;
const MAX_REQUEST_ID = 2147483647; // 2^31 - 1

function getNextRequestId(): number {
  const id = nextRequestId;
  nextRequestId = nextRequestId >= MAX_REQUEST_ID ? 1 : nextRequestId + 1;
  return id;
}

// Store model handles for multimodal operations
const modelHandles = new Map<string, number>();

/**
 * Load an LLM model from a file path
 */
export async function loadModel(
  modelPath: string,
  config: LoadModelConfig = {}
): Promise<LLMModel> {
  const {
    maxTokens = 1024,
    topK = 40,
    temperature = 0.7,
    randomSeed = 42,
    enableVisionModality = false,
    enableAudioModality = false,
    maxNumImages = 10,
  } = config;

  const multimodalOptions: MultimodalOptions = {
    enableVisionModality,
    enableAudioModality,
    maxNumImages,
  };

  const handle = await LitertLlm.createModel(
    modelPath,
    maxTokens,
    topK,
    temperature,
    randomSeed,
    multimodalOptions
  );

  const modelId = `model-${nextModelId++}`;
  modelHandles.set(modelId, handle);

  return {
    id: modelId,
    handle,
    isLoaded: true,
    enableVisionModality,
    enableAudioModality,
    release: async () => {
      await LitertLlm.releaseModel(handle);
      modelHandles.delete(modelId);
    },
    addImage: async (imagePath: string) => {
      if (!enableVisionModality) {
        throw new Error("Vision modality is not enabled for this model");
      }
      return LitertLlm.addImageToSession(handle, imagePath);
    },
    addAudio: async (audioPath: string) => {
      if (!enableAudioModality) {
        throw new Error("Audio modality is not enabled for this model");
      }
      return LitertLlm.addAudioToSession(handle, audioPath);
    },
  };
}

/**
 * Load an LLM model from an asset (Android only)
 */
export async function loadModelFromAsset(
  modelName: string,
  config: LoadModelConfig = {}
): Promise<LLMModel> {
  const {
    maxTokens = 1024,
    topK = 40,
    temperature = 0.7,
    randomSeed = 42,
    enableVisionModality = false,
    enableAudioModality = false,
    maxNumImages = 10,
  } = config;

  const multimodalOptions: MultimodalOptions = {
    enableVisionModality,
    enableAudioModality,
    maxNumImages,
  };

  const handle = await LitertLlm.createModelFromAsset(
    modelName,
    maxTokens,
    topK,
    temperature,
    randomSeed,
    multimodalOptions
  );

  const modelId = `model-${nextModelId++}`;
  modelHandles.set(modelId, handle);

  return {
    id: modelId,
    handle,
    isLoaded: true,
    enableVisionModality,
    enableAudioModality,
    release: async () => {
      await LitertLlm.releaseModel(handle);
      modelHandles.delete(modelId);
    },
    addImage: async (imagePath: string) => {
      if (!enableVisionModality) {
        throw new Error("Vision modality is not enabled for this model");
      }
      return LitertLlm.addImageToSession(handle, imagePath);
    },
    addAudio: async (audioPath: string) => {
      if (!enableAudioModality) {
        throw new Error("Audio modality is not enabled for this model");
      }
      return LitertLlm.addAudioToSession(handle, audioPath);
    },
  };
}

/**
 * Release a loaded model
 */
export async function releaseModel(model: LLMModel): Promise<void> {
  await model.release();
}

/**
 * Extract model handle from model instance (internal)
 */
function getHandleFromModel(model: LLMModel): number {
  // First try to get the handle directly from the model
  if (model.handle !== undefined) {
    return model.handle;
  }
  // Fallback to the stored handles map
  const storedHandle = modelHandles.get(model.id);
  if (storedHandle !== undefined) {
    return storedHandle;
  }
  throw new Error("Model handle not found - model may have been released");
}

/**
 * Add an image to the model session for multimodal inference (internal)
 */
async function addImageInternal(
  handle: number,
  imagePath: string
): Promise<boolean> {
  return LitertLlm.addImageToSession(handle, imagePath);
}

/**
 * Add audio to the model session for multimodal inference (internal)
 */
async function addAudioInternal(
  handle: number,
  audioPath: string
): Promise<boolean> {
  return LitertLlm.addAudioToSession(handle, audioPath);
}

/**
 * Check if a media type is an image
 */
function isImageMediaType(mediaType?: string): boolean {
  if (!mediaType) return false;
  return mediaType.startsWith("image/");
}

/**
 * Check if a media type is audio
 */
function isAudioMediaType(mediaType?: string): boolean {
  if (!mediaType) return false;
  return mediaType.startsWith("audio/");
}

/**
 * Extract file path from various input formats
 * Supports string paths, file:// URIs, and data URIs (base64 not yet supported)
 */
function extractFilePath(
  input: string | Uint8Array | Buffer | ArrayBuffer
): string | null {
  if (typeof input === "string") {
    // Handle file:// URIs
    if (input.startsWith("file://")) {
      return input.replace("file://", "");
    }
    // Handle data URIs - not supported yet for native bridge
    if (input.startsWith("data:")) {
      console.warn("Data URIs are not yet supported for multimodal input");
      return null;
    }
    // Assume it's a file path
    return input;
  }
  // Binary data not yet supported - would need to write to temp file
  console.warn("Binary data input not yet supported for multimodal input");
  return null;
}

/**
 * Process multimodal content from messages and add to session
 * Automatically detects ImagePart and FilePart and calls appropriate native methods
 */
async function processMultimodalContent(
  handle: number,
  messages: ModelMessage[],
  enableVisionModality: boolean,
  enableAudioModality: boolean
): Promise<void> {
  for (const message of messages) {
    if (message.role !== "user" || typeof message.content === "string") {
      continue;
    }

    for (const part of message.content) {
      if (part.type === "image") {
        if (!enableVisionModality) {
          console.warn("Vision modality not enabled, skipping image");
          continue;
        }
        const imagePath = extractFilePath(part.image);
        if (imagePath) {
          await addImageInternal(handle, imagePath);
        }
      } else if (part.type === "file") {
        const filePath = extractFilePath(part.data);
        if (!filePath) continue;

        if (isImageMediaType(part.mediaType)) {
          if (!enableVisionModality) {
            console.warn("Vision modality not enabled, skipping image file");
            continue;
          }
          await addImageInternal(handle, filePath);
        } else if (isAudioMediaType(part.mediaType)) {
          if (!enableAudioModality) {
            console.warn("Audio modality not enabled, skipping audio file");
            continue;
          }
          await addAudioInternal(handle, filePath);
        }
      }
    }
  }
}

/**
 * Convert ModelMessage array to a single prompt string
 * Supports text, images, and files
 */
function messagesToPrompt(messages: ModelMessage[]): string {
  let prompt = "";

  for (const message of messages) {
    const { role, content } = message;

    if (role === "system") {
      prompt += `System: ${content}\n\n`;
    } else if (role === "user") {
      if (typeof content === "string") {
        prompt += `User: ${content}\n\n`;
      } else if (Array.isArray(content)) {
        let userContent = "User: ";
        for (const part of content) {
          if (part.type === "text") {
            userContent += `${part.text} `;
          } else if (part.type === "image") {
            userContent += `[IMAGE: ${part.mediaType || "image"}] `;
          } else if (part.type === "file") {
            userContent += `[FILE: ${part.filename || part.mediaType}] `;
          }
        }
        prompt += `${userContent.trim()}\n\n`;
      }
    } else if (role === "assistant") {
      if (typeof content === "string") {
        prompt += `Assistant: ${content}\n\n`;
      } else if (Array.isArray(content)) {
        let assistantContent = "Assistant: ";
        for (const part of content) {
          if (part.type === "text") {
            assistantContent += `${part.text} `;
          }
        }
        prompt += `${assistantContent.trim()}\n\n`;
      }
    }
  }

  return prompt.trim();
}

/**
 * Generate text from an LLM model (synchronous)
 * Automatically processes multimodal content (images, audio) from messages
 */
export async function generateText(
  model: LLMModel,
  messages: ModelMessage[],
  options: GenerationOptions = {}
): Promise<GenerateTextResult> {
  const { abortSignal } = options;

  const handle = getHandleFromModel(model);

  if (abortSignal?.aborted) {
    throw new Error("Generation was aborted");
  }

  if (abortSignal) {
    abortSignal.addEventListener("abort", () => {
      stopGeneration(model);
    });
  }

  // Automatically process multimodal content from messages
  await processMultimodalContent(
    handle,
    messages,
    model.enableVisionModality ?? false,
    model.enableAudioModality ?? false
  );

  const prompt = messagesToPrompt(messages);

  try {
    const text = await LitertLlm.generateResponse(
      handle,
      getNextRequestId(),
      prompt
    );

    return {
      text,
      finishReason: "stop",
      usage: {
        outputTokens: Math.ceil(text.length / 4),
        totalTokens: Math.ceil((prompt.length + text.length) / 4),
      },
    };
  } catch (error) {
    return {
      text: "",
      finishReason: "error",
    };
  }
}

/**
 * Async generator for streaming text responses
 */
async function* generateTextStream(
  handle: number,
  requestId: number,
  prompt: string,
  abortSignal?: AbortSignal
): AsyncGenerator<string, void, unknown> {
  const queue: string[] = [];
  let error: Error | null = null;
  let isDone = false;

  const partialSubscription = LitertLlm.addListener(
    "onPartialResponse",
    (ev: PartialResponseEventPayload) => {
      if (
        ev.requestId === requestId &&
        ev.handle === handle &&
        !(abortSignal?.aborted ?? false)
      ) {
        queue.push(ev.response);
      }
    }
  );

  const errorSubscription = LitertLlm.addListener(
    "onErrorResponse",
    (ev: ErrorResponseEventPayload) => {
      if (
        ev.requestId === requestId &&
        ev.handle === handle &&
        !(abortSignal?.aborted ?? false)
      ) {
        error = new Error(ev.error);
        partialSubscription.remove();
        errorSubscription.remove();
      }
    }
  );

  if (abortSignal) {
    abortSignal.addEventListener("abort", () => {
      isDone = true;
      partialSubscription.remove();
      errorSubscription.remove();
    });
  }

  await LitertLlm.generateResponseAsync(handle, requestId, prompt)
    .then(() => {
      isDone = true;
      partialSubscription.remove();
      errorSubscription.remove();
    })
    .catch(() => {
      isDone = true;
      partialSubscription.remove();
      errorSubscription.remove();
    });

  while (!isDone || queue.length > 0) {
    if (queue.length > 0) {
      yield queue.shift()!;
    } else if (isDone) {
      break;
    } else {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  if (error) {
    throw error;
  }
}

/**
 * Generate streaming text from an LLM model (async generator)
 * Automatically processes multimodal content (images, audio) from messages
 */
export async function streamText(
  model: LLMModel,
  messages: ModelMessage[],
  options: GenerationOptions = {}
): Promise<StreamTextResult> {
  const { abortSignal } = options;
  const handle = getHandleFromModel(model);
  const requestId = getNextRequestId();

  if (abortSignal?.aborted) {
    throw new Error("Generation was aborted");
  }

  // Automatically process multimodal content from messages
  await processMultimodalContent(
    handle,
    messages,
    model.enableVisionModality ?? false,
    model.enableAudioModality ?? false
  );

  const prompt = messagesToPrompt(messages);

  // Shared state for both textStream and text Promise
  const queue: string[] = [];
  let accumulatedText = "";
  let error: Error | null = null;
  let isDone = false;
  let textResolve: (text: string) => void;
  let textReject: (error: Error) => void;

  const text = new Promise<string>((resolve, reject) => {
    textResolve = resolve;
    textReject = reject;
  });

  // Set up listeners once (shared between stream and text accumulator)
  const partialSubscription = LitertLlm.addListener(
    "onPartialResponse",
    (ev: PartialResponseEventPayload) => {
      const requestIdMatch = ev.requestId === requestId;
      const handleMatch = ev.handle === handle;

      if (requestIdMatch && handleMatch && !(abortSignal?.aborted ?? false)) {
        queue.push(ev.response);
        accumulatedText += ev.response;
      }
    }
  );

  const errorSubscription = LitertLlm.addListener(
    "onErrorResponse",
    (ev: ErrorResponseEventPayload) => {
      if (
        ev.requestId === requestId &&
        ev.handle === handle &&
        !(abortSignal?.aborted ?? false)
      ) {
        error = new Error(ev.error);
        cleanup();
        textReject!(error);
      }
    }
  );

  const cleanup = () => {
    partialSubscription.remove();
    errorSubscription.remove();
  };

  if (abortSignal) {
    abortSignal.addEventListener("abort", () => {
      isDone = true;
      cleanup();
    });
  }

  // Start generation
  LitertLlm.generateResponseAsync(handle, requestId, prompt)
    .then(() => {
      isDone = true;
      cleanup();
      textResolve!(accumulatedText);
    })
    .catch((err) => {
      isDone = true;
      cleanup();
      textReject!(err);
    });

  // Create the async generator that yields from the shared queue
  async function* createTextStream(): AsyncGenerator<string, void, unknown> {
    while (!isDone || queue.length > 0) {
      if (queue.length > 0) {
        const chunk = queue.shift()!;
        yield chunk;
      } else if (isDone) {
        break;
      } else {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }

    if (error) {
      throw error;
    }
  }

  const textStream = createTextStream();

  const finishReason = new Promise<
    "stop" | "length" | "content-filter" | "tool-calls" | "error" | "other"
  >((resolve) => {
    text.then(() => resolve("stop")).catch(() => resolve("error"));
  });

  return {
    textStream,
    text,
    finishReason,
    consumeStream: async (consumeOptions) => {
      try {
        for await (const _ of textStream) {
        }
      } catch (err) {
        if (consumeOptions?.onError) {
          consumeOptions.onError(err);
        } else {
          throw err;
        }
      }
    },
  };
}

/**
 * Stop ongoing generation for a model
 */
export async function stopGeneration(model: LLMModel): Promise<void> {
  const handle = getHandleFromModel(model);
  await LitertLlm.stopGeneration(handle);
}
