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
  StructuredOutputOptions,
  GenerateStructuredOutputResult,
} from "./LlmApi.types";
import type { MultimodalOptions } from "./LitertLlm.types";
import type {
  PartialResponseEventPayload,
  ErrorResponseEventPayload,
  LoggingEventPayload,
} from "./LitertLlm.types";
import type { ZodType, ZodTypeDef } from "zod";

let nextModelId = 1;

const LOG_PREFIX = "[LlmApi]";

function log(message: string, ...args: unknown[]) {
  console.log(`${LOG_PREFIX} ${message}`, ...args);
}

function logError(message: string, error?: unknown) {
  console.error(`${LOG_PREFIX} ${message}`, error || "");
}

// Set up native logging listener - captures logs from Android/iOS native code
let loggingSubscription: { remove: () => void } | null = null;

function enableNativeLogging() {
  if (loggingSubscription) return;

  try {
    loggingSubscription = LitertLlm.addListener("logging", (ev: LoggingEventPayload) => {
      const prefix = ev.handle !== undefined ? `[Native][Handle:${ev.handle}] ` : "[Native] ";
      console.log(`${LOG_PREFIX} ${prefix}${ev.message}`);
    });
    log("Native logging enabled");
  } catch (error) {
    logError("Failed to enable native logging", error);
  }
}

enableNativeLogging();

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
  log(`loadModel called - path: ${modelPath}, config:`, config);

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

  try {
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

    log(`loadModel success - modelId: ${modelId}, handle: ${handle}`);

    return {
      id: modelId,
      handle,
      isLoaded: true,
      enableVisionModality,
      enableAudioModality,
      release: async () => {
        log(`releaseModel called - modelId: ${modelId}, handle: ${handle}`);
        await LitertLlm.releaseModel(handle);
        modelHandles.delete(modelId);
        log(`releaseModel success - modelId: ${modelId}`);
      },
      addImage: async (imagePath: string) => {
        log(`addImage called - modelId: ${modelId}, path: ${imagePath}`);
        if (!enableVisionModality) {
          throw new Error("Vision modality is not enabled for this model");
        }
        return LitertLlm.addImageToSession(handle, imagePath);
      },
      addAudio: async (audioPath: string) => {
        log(`addAudio called - modelId: ${modelId}, path: ${audioPath}`);
        if (!enableAudioModality) {
          throw new Error("Audio modality is not enabled for this model");
        }
        return LitertLlm.addAudioToSession(handle, audioPath);
      },
    };
  } catch (error) {
    logError(`loadModel failed - path: ${modelPath}`, error);
    throw error;
  }
}

/**
 * Load an LLM model from an asset (Android only)
 */
export async function loadModelFromAsset(
  modelName: string,
  config: LoadModelConfig = {}
): Promise<LLMModel> {
  log(`loadModelFromAsset called - modelName: ${modelName}, config:`, config);

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

  try {
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

    log(`loadModelFromAsset success - modelId: ${modelId}, handle: ${handle}`);

    return {
      id: modelId,
      handle,
      isLoaded: true,
      enableVisionModality,
      enableAudioModality,
      release: async () => {
        log(`releaseModel called - modelId: ${modelId}, handle: ${handle}`);
        await LitertLlm.releaseModel(handle);
        modelHandles.delete(modelId);
        log(`releaseModel success - modelId: ${modelId}`);
      },
      addImage: async (imagePath: string) => {
        log(`addImage called - modelId: ${modelId}, path: ${imagePath}`);
        if (!enableVisionModality) {
          throw new Error("Vision modality is not enabled for this model");
        }
        return LitertLlm.addImageToSession(handle, imagePath);
      },
      addAudio: async (audioPath: string) => {
        log(`addAudio called - modelId: ${modelId}, path: ${audioPath}`);
        if (!enableAudioModality) {
          throw new Error("Audio modality is not enabled for this model");
        }
        return LitertLlm.addAudioToSession(handle, audioPath);
      },
    };
  } catch (error) {
    logError(`loadModelFromAsset failed - modelName: ${modelName}`, error);
    throw error;
  }
}

/**
 * Release a loaded model
 */
export async function releaseModel(model: LLMModel): Promise<void> {
  log(`releaseModel called - modelId: ${model.id}`);
  try {
    await model.release();
    log(`releaseModel success - modelId: ${model.id}`);
  } catch (error) {
    logError(`releaseModel failed - modelId: ${model.id}`, error);
    throw error;
  }
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
  log(`addImageInternal - handle: ${handle}, path: ${imagePath}`);
  try {
    const result = await LitertLlm.addImageToSession(handle, imagePath);
    log(`addImageInternal success - handle: ${handle}`);
    return result;
  } catch (error) {
    logError(`addImageInternal failed - handle: ${handle}, path: ${imagePath}`, error);
    throw error;
  }
}

async function addAudioInternal(
  handle: number,
  audioPath: string
): Promise<boolean> {
  log(`addAudioInternal - handle: ${handle}, path: ${audioPath}`);
  try {
    const result = await LitertLlm.addAudioToSession(handle, audioPath);
    log(`addAudioInternal success - handle: ${handle}`);
    return result;
  } catch (error) {
    logError(`addAudioInternal failed - handle: ${handle}, path: ${audioPath}`, error);
    throw error;
  }
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
  log(`processMultimodalContent - handle: ${handle}, vision: ${enableVisionModality}, audio: ${enableAudioModality}`);
  let imageCount = 0;
  let audioCount = 0;

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
          imageCount++;
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
          imageCount++;
        } else if (isAudioMediaType(part.mediaType)) {
          if (!enableAudioModality) {
            console.warn("Audio modality not enabled, skipping audio file");
            continue;
          }
          await addAudioInternal(handle, filePath);
          audioCount++;
        }
      }
    }
  }

  if (imageCount > 0 || audioCount > 0) {
    log(`processMultimodalContent complete - handle: ${handle}, images: ${imageCount}, audio: ${audioCount}`);
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
  const requestId = getNextRequestId();
  log(`generateText called - modelId: ${model.id}, requestId: ${requestId}, messages:`, messages);

  const { abortSignal } = options;

  const handle = getHandleFromModel(model);

  if (abortSignal?.aborted) {
    logError(`generateText aborted before start - modelId: ${model.id}, requestId: ${requestId}`);
    throw new Error("Generation was aborted");
  }

  if (abortSignal) {
    abortSignal.addEventListener("abort", () => {
      log(`generateText abort signal triggered - modelId: ${model.id}, requestId: ${requestId}`);
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
  log(`generateText prompt - modelId: ${model.id}, requestId: ${requestId}, prompt: ${prompt.substring(0, 100)}${prompt.length > 100 ? "..." : ""}`);

  try {
    const text = await LitertLlm.generateResponse(
      handle,
      requestId,
      prompt
    );

    log(`generateText success - modelId: ${model.id}, requestId: ${requestId}, response length: ${text.length}`);
    return {
      text,
      finishReason: "stop",
      usage: {
        outputTokens: Math.ceil(text.length / 4),
        totalTokens: Math.ceil((prompt.length + text.length) / 4),
      },
    };
  } catch (error) {
    logError(`generateText failed - modelId: ${model.id}, requestId: ${requestId}`, error);
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
  log(`streamText called - modelId: ${model.id}, requestId: ${requestId}, messages:`, messages);

  if (abortSignal?.aborted) {
    logError(`streamText aborted before start - modelId: ${model.id}, requestId: ${requestId}`);
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
  log(`streamText prompt - modelId: ${model.id}, requestId: ${requestId}, prompt: ${prompt.substring(0, 100)}${prompt.length > 100 ? "..." : ""}`);

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
        logError(`streamText error response - modelId: ${model.id}, requestId: ${requestId}, error: ${ev.error}`);
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
      log(`streamText abort signal triggered - modelId: ${model.id}, requestId: ${requestId}`);
      isDone = true;
      cleanup();
    });
  }

  // Start generation
  LitertLlm.generateResponseAsync(handle, requestId, prompt)
    .then(() => {
      log(`streamText generation completed - modelId: ${model.id}, requestId: ${requestId}, total length: ${accumulatedText.length}`);
      isDone = true;
      cleanup();
      textResolve!(accumulatedText);
    })
    .catch((err) => {
      logError(`streamText generation failed - modelId: ${model.id}, requestId: ${requestId}`, err);
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
  log(`stopGeneration called - modelId: ${model.id}`);
  try {
    const handle = getHandleFromModel(model);
    await LitertLlm.stopGeneration(handle);
    log(`stopGeneration success - modelId: ${model.id}`);
  } catch (error) {
    logError(`stopGeneration failed - modelId: ${model.id}`, error);
    throw error;
  }
}

/**
 * Convert a Zod schema to JSON Schema format.
 * Supports Zod v4's toJsonSchema() or falls back to manual conversion for v3.
 */
function zodToJsonSchema<T>(schema: ZodType<T, ZodTypeDef, unknown>): object {
  // Check if the schema has a toJsonSchema method (Zod v4 style)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (typeof (schema as any).toJsonSchema === "function") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (schema as any).toJsonSchema();
  }

  // Try to use zod's z.toJsonSchema if available (Zod v4)
  try {
    // Dynamic import approach for Zod v4
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const { toJsonSchema } = require("zod/v4/json-schema");
    if (typeof toJsonSchema === "function") {
      return toJsonSchema(schema);
    }
  } catch {
    // Zod v4 json-schema module not available, try alternative
  }

  // Try zod-to-json-schema package if available
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const zodToJsonSchemaLib = require("zod-to-json-schema");
    if (zodToJsonSchemaLib && typeof zodToJsonSchemaLib.zodToJsonSchema === "function") {
      return zodToJsonSchemaLib.zodToJsonSchema(schema);
    }
    if (typeof zodToJsonSchemaLib === "function") {
      return zodToJsonSchemaLib(schema);
    }
  } catch {
    // zod-to-json-schema not available
  }

  // Fallback: try to extract schema definition from Zod's internal structure
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const def = (schema as any)._def;
  if (def) {
    return convertZodDefToJsonSchema(def);
  }

  throw new Error(
    "Could not convert Zod schema to JSON Schema. " +
    "Please install 'zod-to-json-schema' package or use Zod v4 with 'zod/v4/json-schema'."
  );
}

/**
 * Fallback converter for Zod schema definitions to JSON Schema.
 * This is a simplified converter that handles common cases.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function convertZodDefToJsonSchema(def: any): object {
  const typeName = def.typeName;

  switch (typeName) {
    case "ZodObject": {
      const properties: Record<string, object> = {};
      const required: string[] = [];

      if (def.shape) {
        const shape = typeof def.shape === "function" ? def.shape() : def.shape;
        for (const [key, value] of Object.entries(shape)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const fieldDef = (value as any)._def;
          properties[key] = convertZodDefToJsonSchema(fieldDef);

          // Check if field is optional
          if (fieldDef.typeName !== "ZodOptional" && fieldDef.typeName !== "ZodNullable") {
            required.push(key);
          }
        }
      }

      return {
        type: "object",
        properties,
        ...(required.length > 0 ? { required } : {}),
      };
    }

    case "ZodString":
      return { type: "string" };

    case "ZodNumber":
      return { type: "number" };

    case "ZodBoolean":
      return { type: "boolean" };

    case "ZodArray":
      return {
        type: "array",
        items: def.type ? convertZodDefToJsonSchema(def.type._def) : {},
      };

    case "ZodEnum":
      return {
        type: "string",
        enum: def.values,
      };

    case "ZodLiteral":
      return {
        const: def.value,
      };

    case "ZodOptional":
    case "ZodNullable":
      return convertZodDefToJsonSchema(def.innerType._def);

    case "ZodDefault":
      return {
        ...convertZodDefToJsonSchema(def.innerType._def),
        default: def.defaultValue(),
      };

    case "ZodUnion":
      return {
        oneOf: def.options.map((opt: { _def: unknown }) => convertZodDefToJsonSchema(opt._def)),
      };

    default:
      // For unknown types, return a generic schema
      log(`Unknown Zod type: ${typeName}, using generic schema`);
      return {};
  }
}

/**
 * Generate structured output from an LLM model using tool calling.
 * The model will be forced to output data matching the provided Zod schema.
 *
 * @param model The loaded LLM model (must be a LiteRT-LM model)
 * @param messages Array of messages for context
 * @param schema Zod schema defining the expected output structure
 * @param options Optional configuration (abortSignal, maxRetries)
 * @returns Promise resolving to typed, validated structured data
 *
 * @example
 * ```typescript
 * import { z } from 'zod';
 *
 * const SentimentSchema = z.object({
 *   sentiment: z.enum(['positive', 'negative', 'neutral']),
 *   confidence: z.number().min(0).max(1),
 *   keywords: z.array(z.string()),
 * });
 *
 * const result = await generateStructuredOutput(
 *   model,
 *   [{ role: 'user', content: 'Analyze: "I love this product!"' }],
 *   SentimentSchema
 * );
 *
 * console.log(result.data.sentiment); // 'positive'
 * console.log(result.data.confidence); // 0.95
 * ```
 */
export async function generateStructuredOutput<T>(
  model: LLMModel,
  messages: ModelMessage[],
  schema: ZodType<T, ZodTypeDef, unknown>,
  options: StructuredOutputOptions = {}
): Promise<GenerateStructuredOutputResult<T>> {
  const { abortSignal, maxRetries = 3 } = options;
  const requestId = getNextRequestId();

  log(`generateStructuredOutput called - modelId: ${model.id}, requestId: ${requestId}`);

  const handle = getHandleFromModel(model);

  if (abortSignal?.aborted) {
    logError(`generateStructuredOutput aborted before start - modelId: ${model.id}`);
    throw new Error("Generation was aborted");
  }

  // Convert Zod schema to JSON Schema
  let jsonSchema: object;
  try {
    jsonSchema = zodToJsonSchema(schema);
    log(`generateStructuredOutput - converted schema to JSON Schema`);
  } catch (error) {
    logError(`generateStructuredOutput - schema conversion failed`, error);
    throw new Error(
      `Failed to convert Zod schema to JSON Schema: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // Build prompt from messages
  const prompt = messagesToPrompt(messages);
  const jsonSchemaString = JSON.stringify(jsonSchema);

  log(`generateStructuredOutput - schema: ${jsonSchemaString.substring(0, 200)}...`);

  let lastError: Error | null = null;
  let attempts = 0;

  // Retry loop for validation failures
  while (attempts < maxRetries) {
    attempts++;

    if (abortSignal?.aborted) {
      throw new Error("Generation was aborted");
    }

    try {
      log(`generateStructuredOutput - attempt ${attempts}/${maxRetries}`);

      // Call native structured output generation
      const rawJson = await LitertLlm.generateStructuredOutput(
        handle,
        requestId,
        prompt,
        jsonSchemaString
      );

      log(`generateStructuredOutput - received raw JSON: ${rawJson.substring(0, 200)}...`);

      // Parse the JSON
      let parsedData: unknown;
      try {
        parsedData = JSON.parse(rawJson);
      } catch (parseError) {
        logError(`generateStructuredOutput - JSON parse failed`, parseError);
        lastError = new Error(`Invalid JSON response: ${parseError}`);
        continue; // Retry
      }

      // Validate with Zod schema
      const validationResult = schema.safeParse(parsedData);

      if (validationResult.success) {
        log(`generateStructuredOutput - validation successful on attempt ${attempts}`);
        return {
          data: validationResult.data,
          rawJson,
          attempts,
          finishReason: "stop",
        };
      } else {
        // Validation failed
        const zodError = validationResult.error;
        const errorMessage = zodError.errors
          .map((e) => `${e.path.join(".")}: ${e.message}`)
          .join(", ");

        logError(`generateStructuredOutput - validation failed: ${errorMessage}`);
        lastError = new Error(`Schema validation failed: ${errorMessage}`);

        // If we have retries left, continue
        if (attempts < maxRetries) {
          log(`generateStructuredOutput - retrying due to validation failure`);
          continue;
        }
      }
    } catch (error) {
      logError(`generateStructuredOutput - generation error on attempt ${attempts}`, error);
      lastError = error instanceof Error ? error : new Error(String(error));

      // If it's an unsupported operation error, don't retry
      if (
        error instanceof Error &&
        (error.message.includes("UNSUPPORTED_OPERATION") ||
          error.message.includes("not supported"))
      ) {
        throw error;
      }

      // Continue to retry for other errors
      if (attempts < maxRetries) {
        continue;
      }
    }
  }

  // All retries exhausted
  logError(`generateStructuredOutput - all ${maxRetries} attempts failed`, lastError);

  return {
    data: {} as T, // Empty data on failure
    rawJson: "",
    attempts,
    finishReason: "validation_failed",
  };
}
