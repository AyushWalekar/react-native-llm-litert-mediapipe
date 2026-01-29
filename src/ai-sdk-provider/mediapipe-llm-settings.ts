/**
 * Settings and types for MediaPipe LLM provider
 */

import type { LoadModelConfig } from "../LlmApi.types";

/**
 * Model IDs supported by the MediaPipe LLM provider.
 * These are logical identifiers; actual model loading is based on modelPath/modelName.
 */
export type MediaPipeLlmModelId =
  | "gemma-3n"
  | "gemma-3n-e4b"
  | "gemma-3n-e2b"
  | (string & {});

/**
 * Settings for individual model instances
 */
export interface MediaPipeLlmModelSettings {
  /**
   * Override the model path for this specific model instance.
   * If not provided, uses the provider-level modelPath.
   */
  modelPath?: string;

  /**
   * Override the model asset name for this specific model instance (Android only).
   * If not provided, uses the provider-level modelName.
   */
  modelName?: string;

  /**
   * Override model configuration for this instance.
   */
  config?: LoadModelConfig;

  /**
   * Whether to preload the model immediately when the provider is created.
   * Default: false (lazy loading on first use)
   */
  preload?: boolean;
}

/**
 * Multimodal capabilities for the model
 */
export interface MultimodalCapabilities {
  /** Whether vision (image) input is enabled */
  vision: boolean;
  /** Whether audio input is enabled */
  audio: boolean;
}
