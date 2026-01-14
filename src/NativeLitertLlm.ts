/**
 * Native LiteRT LLM Bridge for bare React Native (no Expo)
 * Uses standard NativeModules and NativeEventEmitter
 */
import { NativeModules, NativeEventEmitter, Platform } from "react-native";

import type {
  LitertLlmModuleInterface,
  LitertLlmModuleEvents,
  NativeModuleSubscription,
  DownloadOptions,
  MultimodalOptions,
} from "./LitertLlm.types";

const LINKING_ERROR =
  `The package 'react-native-llm-litert-mediapipe' doesn't seem to be linked. Make sure: \n\n` +
  Platform.select({ ios: "- You have run 'pod install'\n", default: "" }) +
  "- You rebuilt the app after installing the package\n" +
  "- You are not using Expo Go\n";

// Get the native module - supports both old and new naming
const LitertLlmNative = NativeModules.MediaPipeLlm
  ? NativeModules.MediaPipeLlm
  : new Proxy(
      {},
      {
        get() {
          throw new Error(LINKING_ERROR);
        },
      }
    );

// Create event emitter
const eventEmitter = new NativeEventEmitter(LitertLlmNative);

/**
 * Wrapper module that provides the native API
 * Uses standard React Native NativeModules and NativeEventEmitter
 */
const LitertLlm: LitertLlmModuleInterface = {
  // Model creation methods
  createModel: (
    modelPath: string,
    maxTokens: number,
    topK: number,
    temperature: number,
    randomSeed: number,
    options?: MultimodalOptions
  ): Promise<number> => {
    return LitertLlmNative.createModel(
      modelPath,
      maxTokens,
      topK,
      temperature,
      randomSeed,
      options ?? {}
    );
  },

  createModelFromAsset: (
    modelName: string,
    maxTokens: number,
    topK: number,
    temperature: number,
    randomSeed: number,
    options?: MultimodalOptions
  ): Promise<number> => {
    return LitertLlmNative.createModelFromAsset(
      modelName,
      maxTokens,
      topK,
      temperature,
      randomSeed,
      options ?? {}
    );
  },

  releaseModel: (handle: number): Promise<boolean> => {
    return LitertLlmNative.releaseModel(handle);
  },

  // Generation methods
  generateResponse: (
    handle: number,
    requestId: number,
    prompt: string
  ): Promise<string> => {
    return LitertLlmNative.generateResponse(handle, requestId, prompt);
  },

  generateResponseAsync: (
    handle: number,
    requestId: number,
    prompt: string
  ): Promise<boolean> => {
    return LitertLlmNative.generateResponseAsync(handle, requestId, prompt);
  },

  // Download management methods
  isModelDownloaded: (modelName: string): Promise<boolean> => {
    return LitertLlmNative.isModelDownloaded(modelName);
  },

  getDownloadedModels: (): Promise<string[]> => {
    return LitertLlmNative.getDownloadedModels();
  },

  deleteDownloadedModel: (modelName: string): Promise<boolean> => {
    return LitertLlmNative.deleteDownloadedModel(modelName);
  },

  downloadModel: (
    url: string,
    modelName: string,
    options?: DownloadOptions
  ): Promise<boolean> => {
    return LitertLlmNative.downloadModel(url, modelName, options ?? {});
  },

  cancelDownload: (modelName: string): Promise<boolean> => {
    return LitertLlmNative.cancelDownload(modelName);
  },

  createModelFromDownloaded: (
    modelName: string,
    maxTokens?: number,
    topK?: number,
    temperature?: number,
    randomSeed?: number,
    options?: MultimodalOptions
  ): Promise<number> => {
    return LitertLlmNative.createModelFromDownloaded(
      modelName,
      maxTokens ?? 1024,
      topK ?? 40,
      temperature ?? 0.7,
      randomSeed ?? 42,
      options ?? {}
    );
  },

  // Multimodal methods
  addImageToSession: (handle: number, imagePath: string): Promise<boolean> => {
    return LitertLlmNative.addImageToSession(handle, imagePath);
  },

  addAudioToSession: (handle: number, audioPath: string): Promise<boolean> => {
    return LitertLlmNative.addAudioToSession(handle, audioPath);
  },

  stopGeneration: (handle: number): Promise<boolean> => {
    return LitertLlmNative.stopGeneration(handle);
  },

  generateStructuredOutput: (
    handle: number,
    requestId: number,
    prompt: string,
    outputSchema: string
  ): Promise<string> => {
    return LitertLlmNative.generateStructuredOutput(
      handle,
      requestId,
      prompt,
      outputSchema
    );
  },

  // Event methods - adapted to use NativeEventEmitter
  addListener: <EventName extends keyof LitertLlmModuleEvents>(
    eventName: EventName,
    listener: LitertLlmModuleEvents[EventName]
  ): NativeModuleSubscription => {
    const subscription = eventEmitter.addListener(
      eventName as string,
      listener as (...args: unknown[]) => void
    );
    return {
      remove: () => subscription.remove(),
    };
  },

  removeAllListeners: (event: keyof LitertLlmModuleEvents): void => {
    eventEmitter.removeAllListeners(event as string);
  },
};

export default LitertLlm;
