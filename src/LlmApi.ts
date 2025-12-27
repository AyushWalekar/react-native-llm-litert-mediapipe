/**
 * Standardized LLM API - AI SDK compatible interface
 * Provides loadModel, releaseModel, generateText, streamText, stopGeneration
 */

import MediaPipeLlm from "./NativeMediaPipeLlm";
import {
  ModelMessage,
  LoadModelConfig,
  GenerationOptions,
  GenerateTextResult,
  StreamTextResult,
  LLMModel,
} from "./LlmApi.types";
import type { MultimodalOptions } from "./MediaPipeLlm.types";
import type { PartialResponseEventPayload, ErrorResponseEventPayload } from "./MediaPipeLlm.types";

let nextModelId = 1;

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

  const handle = await MediaPipeLlm.createModel(
    modelPath,
    maxTokens,
    topK,
    temperature,
    randomSeed,
    multimodalOptions
  );

  const modelId = `model-${nextModelId++}`;

  return {
    id: modelId,
    isLoaded: true,
    release: async () => {
      await MediaPipeLlm.releaseModel(handle);
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

  const handle = await MediaPipeLlm.createModelFromAsset(
    modelName,
    maxTokens,
    topK,
    temperature,
    randomSeed,
    multimodalOptions
  );

  const modelId = `model-${nextModelId++}`;

  return {
    id: modelId,
    isLoaded: true,
    release: async () => {
      await MediaPipeLlm.releaseModel(handle);
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
  const match = model.id.match(/model-(\d+)/);
  if (!match) {
    throw new Error("Invalid model ID format");
  }
  return parseInt(match[1], 10);
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

  const prompt = messagesToPrompt(messages);

  try {
    const text = await MediaPipeLlm.generateResponse(handle, Date.now(), prompt);

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

  const partialSubscription = MediaPipeLlm.addListener(
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

  const errorSubscription = MediaPipeLlm.addListener(
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

  await MediaPipeLlm.generateResponseAsync(handle, requestId, prompt)
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
 */
export async function streamText(
  model: LLMModel,
  messages: ModelMessage[],
  options: GenerationOptions = {}
): Promise<StreamTextResult> {
  const { abortSignal } = options;
  const handle = getHandleFromModel(model);
  const requestId = Date.now();

  const prompt = messagesToPrompt(messages);

  if (abortSignal?.aborted) {
    throw new Error("Generation was aborted");
  }

  const textStream = generateTextStream(handle, requestId, prompt, abortSignal);

  const text = new Promise<string>((resolve, reject) => {
    let accumulatedText = "";
    const partialSubscription = MediaPipeLlm.addListener(
      "onPartialResponse",
      (ev: PartialResponseEventPayload) => {
        if (
          ev.requestId === requestId &&
          ev.handle === handle &&
          !(abortSignal?.aborted ?? false)
        ) {
          accumulatedText += ev.response;
        }
      }
    );

    const errorSubscription = MediaPipeLlm.addListener(
      "onErrorResponse",
      (ev: ErrorResponseEventPayload) => {
        if (
          ev.requestId === requestId &&
          ev.handle === handle &&
          !(abortSignal?.aborted ?? false)
        ) {
          partialSubscription.remove();
          errorSubscription.remove();
          reject(new Error(ev.error));
        }
      }
    );

    MediaPipeLlm.generateResponseAsync(handle, requestId, prompt)
      .then(() => {
        partialSubscription.remove();
        errorSubscription.remove();
        resolve(accumulatedText);
      })
      .catch((error) => {
        partialSubscription.remove();
        errorSubscription.remove();
        reject(error);
      });
  });

  const finishReason = new Promise<
    "stop" | "length" | "content-filter" | "tool-calls" | "error" | "other"
  >((resolve) => {
    text
      .then(() => resolve("stop"))
      .catch(() => resolve("error"));
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
  await MediaPipeLlm.stopGeneration(handle);
}
