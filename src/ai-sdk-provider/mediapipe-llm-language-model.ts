/**
 * MediaPipe LLM Language Model implementation for AI SDK V3
 *
 * Implements the LanguageModelV3 interface to enable on-device LLM inference
 * using the standard AI SDK generateText/streamText functions.
 */

import { Platform } from "react-native";
import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3Content,
  LanguageModelV3FinishReason,
  LanguageModelV3GenerateResult,
  LanguageModelV3StreamResult,
  LanguageModelV3StreamPart,
  LanguageModelV3Usage,
  SharedV3Warning,
} from "@ai-sdk/provider";
import { z } from "zod";

import {
  loadModel,
  loadModelFromAsset,
  generateText as nativeGenerateText,
  streamText as nativeStreamText,
  generateStructuredOutput as nativeGenerateStructuredOutput,
} from "../LlmApi";
import type { LLMModel, LoadModelConfig, ModelMessage } from "../LlmApi.types";
import type {
  MediaPipeLlmModelId,
  MediaPipeLlmModelSettings,
} from "./mediapipe-llm-settings";
import { convertPromptToMessages } from "./convert-to-messages";
import { mapFinishReason } from "./map-finish-reason";

const LOG_PREFIX = "[MediaPipeLlm]";

/**
 * Create a properly structured usage object for AI SDK V3
 */
function createUsage(
  inputTokenCount?: number,
  outputTokenCount?: number,
): LanguageModelV3Usage {
  return {
    inputTokens: {
      total: inputTokenCount,
      noCache: inputTokenCount,
      cacheRead: undefined,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: outputTokenCount,
      text: outputTokenCount,
      reasoning: undefined,
    },
  };
}

/**
 * MediaPipe LLM Language Model - AI SDK V3 compatible
 *
 * Supports:
 * - Text generation (doGenerate)
 * - Streaming text generation (doStream)
 * - Multimodal input (images, audio) on Android
 * - Structured output via output schema
 * - Lazy loading with optional preloading
 */
export class MediaPipeLlmLanguageModel implements LanguageModelV3 {
  readonly specificationVersion = "v3" as const;
  readonly provider = "mediapipe-llm";
  readonly defaultObjectGenerationMode = "json" as const;

  readonly modelId: MediaPipeLlmModelId;
  readonly supportsImageUrls = false;
  readonly supportsStructuredOutputs = true;

  // Supported URL patterns for file inputs
  // Using "*/*" with /.*/ to match all URLs and prevent AI SDK from downloading them
  supportedUrls: Record<string, RegExp[]> = { "*/*": [/.*/] };

  private config: LoadModelConfig;
  private modelPath?: string;
  private modelName?: string;
  private model: LLMModel | null = null;
  private loadingPromise: Promise<LLMModel> | null = null;
  private isPreloaded = false;

  constructor(
    modelId: MediaPipeLlmModelId,
    settings: MediaPipeLlmModelSettings & {
      modelPath?: string;
      modelName?: string;
      config?: LoadModelConfig;
    },
  ) {
    this.modelId = modelId;
    this.modelPath = settings.modelPath;
    this.modelName = settings.modelName;
    this.config = settings.config || {};

    // Handle preloading
    if (settings.preload) {
      this.preload().catch((error) => {
        console.error(`${LOG_PREFIX} Preload failed:`, error);
      });
    }
  }

  /**
   * Preload the model for faster first inference.
   * Call this if you want to avoid cold-start latency.
   */
  async preload(): Promise<void> {
    if (this.model || this.loadingPromise) {
      return;
    }

    console.log(`${LOG_PREFIX} Preloading model: ${this.modelId}`);
    await this.ensureModelLoaded();
    this.isPreloaded = true;
    console.log(`${LOG_PREFIX} Model preloaded: ${this.modelId}`);
  }

  /**
   * Check if the model is currently loaded
   */
  get isLoaded(): boolean {
    return this.model !== null && this.model.isLoaded;
  }

  /**
   * Release the model to free memory.
   * The model will be reloaded on next use.
   */
  async release(): Promise<void> {
    if (this.model) {
      console.log(`${LOG_PREFIX} Releasing model: ${this.modelId}`);
      await this.model.release();
      this.model = null;
      this.loadingPromise = null;
      this.isPreloaded = false;
    }
  }

  /**
   * Ensure the model is loaded, with lazy loading support.
   * Uses a loading promise to prevent multiple simultaneous loads.
   */
  private async ensureModelLoaded(): Promise<LLMModel> {
    // Already loaded
    if (this.model && this.model.isLoaded) {
      return this.model;
    }

    // Already loading
    if (this.loadingPromise) {
      return this.loadingPromise;
    }

    // Start loading
    this.loadingPromise = this.loadModelInternal();

    try {
      this.model = await this.loadingPromise;
      return this.model;
    } catch (error) {
      this.loadingPromise = null;
      throw error;
    }
  }

  /**
   * Internal model loading logic
   */
  private async loadModelInternal(): Promise<LLMModel> {
    console.log(`${LOG_PREFIX} Loading model: ${this.modelId}`);

    // Check platform capabilities and warn
    this.checkPlatformCapabilities();

    if (this.modelPath) {
      return loadModel(this.modelPath, this.config);
    } else if (this.modelName) {
      return loadModelFromAsset(this.modelName, this.config);
    } else {
      throw new Error(
        `${LOG_PREFIX} No modelPath or modelName provided. ` +
          "Please specify either modelPath (file path) or modelName (asset name for Android).",
      );
    }
  }

  /**
   * Check platform capabilities and emit warnings
   */
  private checkPlatformCapabilities(): void {
    if (Platform.OS === "ios") {
      if (this.config.enableVisionModality) {
        console.warn(
          `${LOG_PREFIX} Vision modality is not supported on iOS. ` +
            "Image inputs will be ignored. This feature is Android-only.",
        );
      }
      if (this.config.enableAudioModality) {
        console.warn(
          `${LOG_PREFIX} Audio modality is not supported on iOS. ` +
            "Audio inputs will be ignored. This feature is Android-only.",
        );
      }
    }

    if (Platform.OS === "android") {
      if (this.config.enableAudioModality) {
        console.log(
          `${LOG_PREFIX} Audio modality enabled. ` +
            "Ensure audio files are in mono WAV format for best results.",
        );
      }
    }
  }

  /**
   * Generate text (non-streaming) - AI SDK V3 interface
   */
  async doGenerate(
    options: LanguageModelV3CallOptions,
  ): Promise<LanguageModelV3GenerateResult> {
    const model = await this.ensureModelLoaded();
    const messages = convertPromptToMessages(options.prompt);
    const warnings: SharedV3Warning[] = [];

    // Check for structured output request via responseFormat (AI SDK V3)
    if (
      options.responseFormat?.type === "json" &&
      options.responseFormat?.schema
    ) {
      console.log(`${LOG_PREFIX} Generating structured output with schema.`);
      return this.doGenerateStructured(model, messages, options, warnings);
    }

    // Standard text generation
    const result = await nativeGenerateText(model, messages, {
      abortSignal: options.abortSignal,
    });

    const content: LanguageModelV3Content[] = [
      {
        type: "text",
        text: result.text,
      },
    ];

    return {
      content,
      finishReason: mapFinishReason(result.finishReason),
      usage: createUsage(result.usage?.inputTokens, result.usage?.outputTokens),
      warnings,
    };
  }

  /**
   * Generate structured output using schema
   */
  private async doGenerateStructured(
    model: LLMModel,
    messages: ModelMessage[],
    options: LanguageModelV3CallOptions,
    warnings: SharedV3Warning[],
  ): Promise<LanguageModelV3GenerateResult> {
    const responseFormat = options.responseFormat as {
      type: "json";
      schema?: unknown;
      name?: string;
      description?: string;
    };

    // Convert JSON Schema to Zod schema for our native layer
    // Our native generateStructuredOutput expects a Zod schema
    let zodSchema: z.ZodObject<z.ZodRawShape>;

    try {
      // If it's already a Zod schema, use it directly
      if (
        responseFormat.schema &&
        typeof (responseFormat.schema as z.ZodObject<z.ZodRawShape>)
          .safeParse === "function"
      ) {
        zodSchema = responseFormat.schema as z.ZodObject<z.ZodRawShape>;
      } else if (responseFormat.schema) {
        // It's a JSON Schema - create a custom Zod schema that returns the provided JSON schema
        const jsonSchema = responseFormat.schema;
        zodSchema = z.object({}).passthrough();

        // Store the JSON schema and override toJSONSchema method
        const originalToJSONSchema = zodSchema.toJSONSchema.bind(zodSchema);
        (
          zodSchema as unknown as { _customJsonSchema: unknown }
        )._customJsonSchema = jsonSchema;
        zodSchema.toJSONSchema = function (params) {
          // Return wrapped schema that includes the original JSON schema
          const base = originalToJSONSchema(params);
          return { ...base, ...jsonSchema } as ReturnType<
            typeof originalToJSONSchema
          >;
        };
      } else {
        zodSchema = z.object({}).passthrough();
        warnings.push({
          type: "other",
          message: "No schema provided for structured output.",
        });
      }
    } catch {
      zodSchema = z.object({}).passthrough();
    }

    const result = await nativeGenerateStructuredOutput(
      model,
      messages,
      zodSchema,
      {
        abortSignal: options.abortSignal,
        maxRetries: 3,
      },
    );

    const content: LanguageModelV3Content[] = [
      {
        type: "text",
        text: result.rawJson || JSON.stringify(result.data),
      },
    ];

    return {
      content,
      finishReason: mapFinishReason(result.finishReason),
      usage: createUsage(undefined, undefined),
      warnings,
    };
  }

  /**
   * Stream text generation - AI SDK V3 interface
   */
  async doStream(
    options: LanguageModelV3CallOptions,
  ): Promise<LanguageModelV3StreamResult> {
    const model = await this.ensureModelLoaded();
    const messages = convertPromptToMessages(options.prompt);
    const warnings: SharedV3Warning[] = [];

    // Create a TransformStream for AI SDK compatibility
    const { readable, writable } = new TransformStream<
      LanguageModelV3StreamPart,
      LanguageModelV3StreamPart
    >();

    const writer = writable.getWriter();

    // Generate a unique ID for the text content
    const textId = `text-${Date.now()}`;

    // Start streaming in background
    (async () => {
      try {
        const streamResult = await nativeStreamText(model, messages, {
          abortSignal: options.abortSignal,
        });

        // Emit stream start
        await writer.write({
          type: "stream-start",
          warnings: [],
        });

        // Emit text start
        await writer.write({
          type: "text-start",
          id: textId,
        });

        let totalText = "";

        // Stream text chunks as deltas
        for await (const chunk of streamResult.textStream) {
          totalText += chunk;
          await writer.write({
            type: "text-delta",
            id: textId,
            delta: chunk,
          });
        }

        // Emit text end
        await writer.write({
          type: "text-end",
          id: textId,
        });

        // Get finish reason
        const finishReason = await streamResult.finishReason;

        // Emit finish with proper usage format
        await writer.write({
          type: "finish",
          finishReason: mapFinishReason(finishReason),
          usage: createUsage(undefined, Math.ceil(totalText.length / 4)),
        });

        await writer.close();
      } catch (error) {
        await writer.write({
          type: "error",
          error: error instanceof Error ? error : new Error(String(error)),
        });
        await writer.close();
      }
    })();

    return {
      stream: readable,
    };
  }
}
