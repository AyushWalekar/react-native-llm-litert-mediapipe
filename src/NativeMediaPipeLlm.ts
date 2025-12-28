/**
 * Native MediaPipe LLM Bridge for bare React Native (no Expo)
 * Uses standard NativeModules and NativeEventEmitter
 */
import { NativeModules, NativeEventEmitter, Platform } from "react-native";

import type {
  ExpoLlmMediapipeModule as NativeModuleType,
  ExpoLlmMediapipeModuleEvents,
  NativeModuleSubscription,
  DownloadOptions,
  MultimodalOptions,
} from "./MediaPipeLlm.types";

const LINKING_ERROR =
  `The package 'react-native-llm-litert-mediapipe' doesn't seem to be linked. Make sure: \n\n` +
  Platform.select({ ios: "- You have run 'pod install'\n", default: "" }) +
  "- You rebuilt the app after installing the package\n" +
  "- You are not using Expo Go\n";

// Get the native module
const MediaPipeLlmModule = NativeModules.MediaPipeLlm
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
const eventEmitter = new NativeEventEmitter(MediaPipeLlmModule);

/**
 * Wrapper module that provides the same API as the Expo module
 * but uses standard React Native NativeModules and NativeEventEmitter
 */
const MediaPipeLlm: NativeModuleType = {
  // Model creation methods
  createModel: (
    modelPath: string,
    maxTokens: number,
    topK: number,
    temperature: number,
    randomSeed: number,
    options?: MultimodalOptions
  ): Promise<number> => {
    return MediaPipeLlmModule.createModel(
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
    return MediaPipeLlmModule.createModelFromAsset(
      modelName,
      maxTokens,
      topK,
      temperature,
      randomSeed,
      options ?? {}
    );
  },

  releaseModel: (handle: number): Promise<boolean> => {
    return MediaPipeLlmModule.releaseModel(handle);
  },

  // Generation methods
  generateResponse: (
    handle: number,
    requestId: number,
    prompt: string
  ): Promise<string> => {
    return MediaPipeLlmModule.generateResponse(handle, requestId, prompt);
  },

  generateResponseAsync: (
    handle: number,
    requestId: number,
    prompt: string
  ): Promise<boolean> => {
    return MediaPipeLlmModule.generateResponseAsync(handle, requestId, prompt);
  },

  // Download management methods
  isModelDownloaded: (modelName: string): Promise<boolean> => {
    return MediaPipeLlmModule.isModelDownloaded(modelName);
  },

  getDownloadedModels: (): Promise<string[]> => {
    return MediaPipeLlmModule.getDownloadedModels();
  },

  deleteDownloadedModel: (modelName: string): Promise<boolean> => {
    return MediaPipeLlmModule.deleteDownloadedModel(modelName);
  },

  downloadModel: (
    url: string,
    modelName: string,
    options?: DownloadOptions
  ): Promise<boolean> => {
    return MediaPipeLlmModule.downloadModel(url, modelName, options ?? {});
  },

  cancelDownload: (modelName: string): Promise<boolean> => {
    return MediaPipeLlmModule.cancelDownload(modelName);
  },

  createModelFromDownloaded: (
    modelName: string,
    maxTokens?: number,
    topK?: number,
    temperature?: number,
    randomSeed?: number,
    options?: MultimodalOptions
  ): Promise<number> => {
    return MediaPipeLlmModule.createModelFromDownloaded(
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
    return MediaPipeLlmModule.addImageToSession(handle, imagePath);
  },

  addAudioToSession: (handle: number, audioPath: string): Promise<boolean> => {
    return MediaPipeLlmModule.addAudioToSession(handle, audioPath);
  },

  stopGeneration: (handle: number): Promise<boolean> => {
    return MediaPipeLlmModule.stopGeneration(handle);
  },

  // Event methods - adapted to use NativeEventEmitter
  addListener: <EventName extends keyof ExpoLlmMediapipeModuleEvents>(
    eventName: EventName,
    listener: ExpoLlmMediapipeModuleEvents[EventName]
  ): NativeModuleSubscription => {
    const subscription = eventEmitter.addListener(
      eventName as string,
      listener as (...args: unknown[]) => void
    );
    return {
      remove: () => subscription.remove(),
    };
  },

  removeAllListeners: (event: keyof ExpoLlmMediapipeModuleEvents): void => {
    eventEmitter.removeAllListeners(event as string);
  },
};

export default MediaPipeLlm;
