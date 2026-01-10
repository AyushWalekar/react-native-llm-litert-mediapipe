/**
 * LitertLlmModule - React hooks and utilities for LiteRT LLM inference
 * Clean API for bare React Native (no Expo required)
 */
import * as React from "react";

import LitertLlm from "./NativeLitertLlm";
import {
  loadModel,
  loadModelFromAsset,
  releaseModel,
  generateText,
  streamText,
  stopGeneration,
} from "./LlmApi";
import type {
  LLMModel,
  ModelMessage,
  GenerationOptions,
  LoadModelConfig,
} from "./LlmApi.types";

/**
 * React hook for using the LiteRT LLM API
 * Compatible with AI SDK's ModelMessage format
 *
 * @example
 * ```tsx
 * const { model, isLoaded, loadModel, generate, stream } = useLlm({
 *   type: 'file',
 *   path: '/path/to/model.litertlm',
 *   config: { maxTokens: 1024, temperature: 0.8 }
 * });
 *
 * // Load the model
 * await loadModel();
 *
 * // Generate text
 * const result = await generate([
 *   { role: 'system', content: 'You are a helpful assistant.' },
 *   { role: 'user', content: 'Hello!' }
 * ]);
 * console.log(result.text);
 *
 * // Stream text
 * const streamResult = await stream(messages);
 * for await (const chunk of streamResult.textStream) {
 *   console.log(chunk);
 * }
 * ```
 */
export function useLlm(
  config:
    | { type: "file"; path: string; config?: LoadModelConfig }
    | { type: "asset"; name: string; config?: LoadModelConfig }
) {
  const [model, setModel] = React.useState<LLMModel | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [isGenerating, setIsGenerating] = React.useState(false);

  const loadModelInternal = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      let loadedModel: LLMModel;
      if (config.type === "file") {
        loadedModel = await loadModel(config.path, config.config ?? {});
      } else {
        loadedModel = await loadModelFromAsset(
          config.name,
          config.config ?? {}
        );
      }
      setModel(loadedModel);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoading(false);
    }
  }, [config]);

  const unloadModel = React.useCallback(async () => {
    if (model) {
      await releaseModel(model);
      setModel(null);
    }
  }, [model]);

  const generate = React.useCallback(
    async (messages: ModelMessage[], options?: GenerationOptions) => {
      if (!model) {
        throw new Error("Model not loaded");
      }
      setIsGenerating(true);
      try {
        const result = await generateText(model, messages, options);
        return result;
      } finally {
        setIsGenerating(false);
      }
    },
    [model]
  );

  const stream = React.useCallback(
    async (messages: ModelMessage[], options?: GenerationOptions) => {
      if (!model) {
        throw new Error("Model not loaded");
      }
      setIsGenerating(true);
      try {
        const result = await streamText(model, messages, options);
        return result;
      } finally {
        setIsGenerating(false);
      }
    },
    [model]
  );

  const cancel = React.useCallback(async () => {
    if (model) {
      await stopGeneration(model);
      setIsGenerating(false);
    }
  }, [model]);

  React.useEffect(() => {
    return () => {
      if (model) {
        releaseModel(model).catch((e) =>
          console.error("Failed to release model:", e)
        );
      }
    };
  }, [model]);

  return {
    /** The loaded model instance */
    model,
    /** Whether the model is loaded and ready */
    isLoaded: model !== null && !isLoading,
    /** Whether the model is currently loading */
    isLoading,
    /** Whether text generation is in progress */
    isGenerating,
    /** Error message if loading failed */
    error,
    /** Load the model */
    loadModel: loadModelInternal,
    /** Unload the model and release resources */
    unloadModel,
    /** Generate text (complete response) */
    generate,
    /** Stream text (async iterable) */
    stream,
    /** Cancel ongoing generation */
    cancel,
  };
}

// Re-export the native module for advanced use cases
export { LitertLlm };

// Re-export functional API
export {
  loadModel,
  loadModelFromAsset,
  releaseModel,
  generateText,
  streamText,
  stopGeneration,
} from "./LlmApi";

export default LitertLlm;
