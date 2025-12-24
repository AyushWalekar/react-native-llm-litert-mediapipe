/**
 * MediaPipeLlmModule - React hooks and utilities for bare React Native
 * Uses standard NativeModules instead of Expo
 *
 * Provides OpenAI-compatible / llama.rn-style API for:
 * - Chat completion with message arrays
 * - Multimodal input (images, audio)
 * - Streaming responses
 */
import * as React from "react";

import MediaPipeLlm from "./NativeMediaPipeLlm";
import type {
  DownloadOptions,
  DownloadProgressEvent,
  UseLLMProps,
  BaseLlmReturn,
  DownloadableLlmReturn,
  UseLLMAssetProps,
  UseLLMFileProps,
  UseLLMDownloadableProps,
  PartialResponseEventPayload,
  ErrorResponseEventPayload,
  CompletionOptions,
  CompletionResult,
  StreamCallback,
  ModelInfo,
} from "./MediaPipeLlm.types";
import {
  formatChatMessages,
  detectTemplate,
  type FormattedChat,
} from "./utils/chatFormatter";

// ============================================================================
// Helper Functions for Chat Completion
// ============================================================================

/**
 * Detect model type from path
 */
function detectModelType(
  modelPath: string
): "mediapipe" | "litertlm" | "unknown" {
  const lowerPath = modelPath.toLowerCase();
  if (lowerPath.endsWith(".litertlm")) {
    return "litertlm";
  }
  if (lowerPath.endsWith(".task")) {
    return "mediapipe";
  }
  return "unknown";
}

/**
 * Create ModelInfo from model path and options
 */
function createModelInfo(
  modelPath: string,
  enableVision?: boolean,
  enableAudio?: boolean
): ModelInfo {
  const type = detectModelType(modelPath);
  const name = modelPath.split("/").pop() || modelPath;

  return {
    name,
    type,
    supportsVision: enableVision ?? false,
    supportsAudio: enableAudio ?? false,
  };
}

/**
 * Process multimodal content by adding images/audio to session
 */
async function addMediaToSession(
  modelHandle: number,
  formattedChat: FormattedChat
): Promise<void> {
  const { media } = formattedChat;

  // Add images first
  for (const imagePath of media.images) {
    // Skip data URLs for now (would need base64 decoding on native side)
    if (imagePath.startsWith("data:")) {
      console.warn(
        "Base64 data URLs for images are not yet supported. Use file:// paths."
      );
      continue;
    }
    await MediaPipeLlm.addImageToSession(modelHandle, imagePath);
  }

  // Add audio
  for (const audioPath of media.audio) {
    if (audioPath.startsWith("data:")) {
      console.warn(
        "Base64 data URLs for audio are not yet supported. Use file:// paths."
      );
      continue;
    }
    await MediaPipeLlm.addAudioToSession(modelHandle, audioPath);
  }
}

// ============================================================================
// Hook Overloads
// ============================================================================

export function useLLM(props: UseLLMDownloadableProps): DownloadableLlmReturn;
export function useLLM(props: UseLLMAssetProps): BaseLlmReturn;
export function useLLM(props: UseLLMFileProps): BaseLlmReturn;

// Dispatcher Implementation
export function useLLM(
  props: UseLLMProps
): BaseLlmReturn | DownloadableLlmReturn {
  if ("modelUrl" in props && props.modelUrl !== undefined) {
    return _useLLMDownloadable(props as UseLLMDownloadableProps);
  } else {
    return _useLLMBase(props as UseLLMAssetProps | UseLLMFileProps);
  }
}


// Internal implementation for Downloadable models
function _useLLMDownloadable(
  props: UseLLMDownloadableProps
): DownloadableLlmReturn {
  const [modelHandle, setModelHandle] = React.useState<number | undefined>();
  const nextRequestIdRef = React.useRef(0);

  const [downloadStatus, setDownloadStatus] = React.useState<
    "not_downloaded" | "downloading" | "downloaded" | "error"
  >("not_downloaded");
  const [downloadProgress, setDownloadProgress] = React.useState<number>(0);
  const [downloadError, setDownloadError] = React.useState<string | null>(null);
  const [isCheckingStatus, setIsCheckingStatus] = React.useState(true);

  const {
    modelUrl,
    modelName,
    maxTokens,
    topK,
    temperature,
    randomSeed,
    enableVisionModality,
    enableAudioModality,
    maxNumImages,
  } = props;

  React.useEffect(() => {
    const checkModelStatus = async () => {
      setIsCheckingStatus(true);
      try {
        const isDownloaded = await MediaPipeLlm.isModelDownloaded(modelName);
        setDownloadStatus(isDownloaded ? "downloaded" : "not_downloaded");
        if (isDownloaded) setDownloadProgress(1);
        else setDownloadProgress(0);
      } catch (error) {
        console.error(`Error checking model status for ${modelName}:`, error);
        setDownloadError(
          error instanceof Error ? error.message : String(error)
        );
        setDownloadStatus("error");
      } finally {
        setIsCheckingStatus(false);
      }
    };
    checkModelStatus();
  }, [modelName]);

  React.useEffect(() => {
    const subscription = MediaPipeLlm.addListener(
      "downloadProgress",
      (event: DownloadProgressEvent) => {
        if (event.modelName !== modelName) return;

        if (event.status === "downloading" && event.progress !== undefined) {
          setDownloadProgress(event.progress);
          setDownloadStatus("downloading");
        } else if (event.status === "completed") {
          setDownloadProgress(1);
          setDownloadStatus("downloaded");
          setDownloadError(null);
        } else if (event.status === "error") {
          setDownloadStatus("error");
          setDownloadError(event.error || "Unknown error occurred");
        } else if (event.status === "cancelled") {
          setDownloadStatus("not_downloaded");
          setDownloadProgress(0);
        }
      }
    );
    return () => subscription.remove();
  }, [modelName]);

  React.useEffect(() => {
    const currentModelHandle = modelHandle;
    return () => {
      if (currentModelHandle !== undefined) {
        console.log(
          `Releasing downloadable model with handle ${currentModelHandle}.`
        );
        MediaPipeLlm.releaseModel(currentModelHandle)
          .then(() =>
            console.log(`Successfully released model ${currentModelHandle}`)
          )
          .catch((error) =>
            console.error(`Error releasing model ${currentModelHandle}:`, error)
          );
      }
    };
  }, [modelHandle]);

  const downloadModelHandler = React.useCallback(
    async (options?: DownloadOptions): Promise<boolean> => {
      try {
        setDownloadStatus("downloading");
        setDownloadProgress(0);
        setDownloadError(null);
        const result = await MediaPipeLlm.downloadModel(
          modelUrl,
          modelName,
          options
        );
        return result;
      } catch (error) {
        console.error(`Error initiating download for ${modelName}:`, error);
        setDownloadStatus("error");
        setDownloadError(
          error instanceof Error ? error.message : String(error)
        );
        throw error;
      }
    },
    [modelUrl, modelName]
  );

  React.useEffect(() => {
    const subscription = MediaPipeLlm.addListener(
      "logging",
      (event: { handle?: number; message: string }) => {
        // Log all native messages to help debugging
        console.log(`(Native) ${event.message}`);
      }
    );
    return () => subscription.remove();
  }, []);

  const loadModelHandler = React.useCallback(async (): Promise<void> => {
    if (modelHandle !== undefined) {
      console.log(`Model ${modelName} already loaded or load in progress.`);
      return;
    }
    if (downloadStatus !== "downloaded") {
      throw new Error(
        `Model ${modelName} is not downloaded. Call downloadModel() first.`
      );
    }
    try {
      console.log(`Attempting to load downloaded model: ${modelName}`);
      const handle = await MediaPipeLlm.createModelFromDownloaded(
        modelName,
        maxTokens ?? 512,
        topK ?? 40,
        temperature ?? 0.8,
        randomSeed ?? 0,
        { enableVisionModality, enableAudioModality, maxNumImages }
      );
      console.log(
        `Loaded downloaded model '${modelName}' with handle ${handle}`
      );
      setModelHandle(handle);
    } catch (error) {
      console.error(`Error loading downloaded model '${modelName}':`, error);
      setModelHandle(undefined);
      throw error;
    }
  }, [
    modelHandle,
    downloadStatus,
    modelName,
    maxTokens,
    topK,
    temperature,
    randomSeed,
    enableVisionModality,
    enableAudioModality,
    maxNumImages,
  ]);

  const generateResponse = React.useCallback(
    async (
      promptText: string,
      onPartial?: (partial: string, reqId: number | undefined) => void,
      onErrorCb?: (message: string, reqId: number | undefined) => void,
      abortSignal?: AbortSignal
    ): Promise<string> => {
      if (modelHandle === undefined) {
        throw new Error("Model is not loaded. Call loadModel() first.");
      }
      const requestId = nextRequestIdRef.current++;

      const partialSub = MediaPipeLlm.addListener(
        "onPartialResponse",
        (ev: PartialResponseEventPayload) => {
          if (
            onPartial &&
            requestId === ev.requestId &&
            ev.handle === modelHandle &&
            !(abortSignal?.aborted ?? false)
          ) {
            onPartial(ev.response, ev.requestId);
          }
        }
      );
      const errorSub = MediaPipeLlm.addListener(
        "onErrorResponse",
        (ev: ErrorResponseEventPayload) => {
          if (
            onErrorCb &&
            requestId === ev.requestId &&
            ev.handle === modelHandle &&
            !(abortSignal?.aborted ?? false)
          ) {
            onErrorCb(ev.error, ev.requestId);
          }
        }
      );

      try {
        return await MediaPipeLlm.generateResponse(
          modelHandle,
          requestId,
          promptText
        );
      } catch (e) {
        console.error("Generate response error:", e);
        if (onErrorCb && !(abortSignal?.aborted ?? false)) {
          onErrorCb(e instanceof Error ? e.message : String(e), requestId);
        }
        throw e;
      } finally {
        partialSub.remove();
        errorSub.remove();
      }
    },
    [modelHandle]
  );

  const generateStreamingResponse = React.useCallback(
    async (
      promptText: string,
      onPartial?: (partial: string, reqId: number) => void,
      onErrorCb?: (message: string, reqId: number) => void,
      abortSignal?: AbortSignal
    ): Promise<void> => {
      if (modelHandle === undefined) {
        throw new Error("Model is not loaded. Call loadModel() first.");
      }
      const requestId = nextRequestIdRef.current++;

      return new Promise<void>((resolve, reject) => {
        const partialSubscription = MediaPipeLlm.addListener(
          "onPartialResponse",
          (ev: PartialResponseEventPayload) => {
            if (
              ev.handle === modelHandle &&
              ev.requestId === requestId &&
              !(abortSignal?.aborted ?? false)
            ) {
              if (onPartial) onPartial(ev.response, ev.requestId);
            }
          }
        );
        const errorSubscription = MediaPipeLlm.addListener(
          "onErrorResponse",
          (ev: ErrorResponseEventPayload) => {
            if (
              ev.handle === modelHandle &&
              ev.requestId === requestId &&
              !(abortSignal?.aborted ?? false)
            ) {
              if (onErrorCb) onErrorCb(ev.error, ev.requestId);
              errorSubscription.remove();
              partialSubscription.remove();
              reject(new Error(ev.error));
            }
          }
        );

        if (abortSignal) {
          abortSignal.addEventListener("abort", () => {
            errorSubscription.remove();
            partialSubscription.remove();
            console.log(`Request ${requestId} aborted for downloadable model.`);
            reject(new Error("Aborted"));
          });
        }

        MediaPipeLlm.generateResponseAsync(modelHandle, requestId, promptText)
          .then(() => {
            if (!(abortSignal?.aborted ?? false)) {
              errorSubscription.remove();
              partialSubscription.remove();
              resolve();
            }
          })
          .catch((error) => {
            if (!(abortSignal?.aborted ?? false)) {
              errorSubscription.remove();
              partialSubscription.remove();
              if (onErrorCb) {
                onErrorCb(
                  error instanceof Error ? error.message : String(error),
                  requestId
                );
              }
              reject(error);
            }
          });
      });
    },
    [modelHandle]
  );

  const addImage = React.useCallback(
    async (imagePath: string): Promise<boolean> => {
      if (modelHandle === undefined) {
        throw new Error("Model is not loaded. Call loadModel() first.");
      }
      console.log("addImage: Adding image to session:", imagePath);
      return MediaPipeLlm.addImageToSession(modelHandle, imagePath);
    },
    [modelHandle]
  );

  const addAudio = React.useCallback(
    async (audioPath: string): Promise<boolean> => {
      if (modelHandle === undefined) {
        throw new Error("Model is not loaded. Call loadModel() first.");
      }
      console.log("addAudio: Adding audio to session:", audioPath);
      return MediaPipeLlm.addAudioToSession(modelHandle, audioPath);
    },
    [modelHandle]
  );

  // Model info (memoized)
  const modelInfo = React.useMemo<ModelInfo | null>(() => {
    if (!modelName) return null;
    return createModelInfo(modelName, enableVisionModality, enableAudioModality);
  }, [modelName, enableVisionModality, enableAudioModality]);

  const getModelInfo = React.useCallback((): ModelInfo | null => {
    return modelInfo;
  }, [modelInfo]);

  // Clear context/session
  const clearContext = React.useCallback(async (): Promise<void> => {
    if (modelHandle === undefined) {
      throw new Error("Model is not loaded. Call loadModel() first.");
    }
    await MediaPipeLlm.clearSession(modelHandle);
  }, [modelHandle]);

  // =========================================================================
  // OpenAI-compatible completion method
  // =========================================================================
  const completion = React.useCallback(
    async (
      options: CompletionOptions,
      onToken?: StreamCallback,
      abortSignal?: AbortSignal
    ): Promise<CompletionResult> => {
      if (modelHandle === undefined) {
        throw new Error("Model is not loaded. Call loadModel() first.");
      }

      const requestId = nextRequestIdRef.current++;

      // Format messages to prompt and extract multimodal content
      const template = detectTemplate(modelName);
      const formattedChat = formatChatMessages(options, template);

      // Add multimodal content to session
      await addMediaToSession(modelHandle, formattedChat);

      // Track accumulated text for streaming
      let accumulatedText = "";

      return new Promise<CompletionResult>((resolve, reject) => {
        const partialSubscription = MediaPipeLlm.addListener(
          "onPartialResponse",
          (ev: PartialResponseEventPayload) => {
            if (
              ev.handle === modelHandle &&
              ev.requestId === requestId &&
              !(abortSignal?.aborted ?? false)
            ) {
              accumulatedText += ev.response;
              if (onToken) {
                onToken({ token: ev.response, text: accumulatedText });
              }
            }
          }
        );

        const errorSubscription = MediaPipeLlm.addListener(
          "onErrorResponse",
          (ev: ErrorResponseEventPayload) => {
            if (
              ev.handle === modelHandle &&
              ev.requestId === requestId &&
              !(abortSignal?.aborted ?? false)
            ) {
              errorSubscription.remove();
              partialSubscription.remove();
              reject(new Error(ev.error));
            }
          }
        );

        if (abortSignal) {
          abortSignal.addEventListener("abort", () => {
            errorSubscription.remove();
            partialSubscription.remove();
            reject(new Error("Aborted"));
          });
        }

        // Use streaming if onToken callback is provided, otherwise sync
        if (onToken) {
          MediaPipeLlm.generateResponseAsync(
            modelHandle,
            requestId,
            formattedChat.prompt
          )
            .then(() => {
              if (!(abortSignal?.aborted ?? false)) {
                errorSubscription.remove();
                partialSubscription.remove();
                resolve({
                  text: accumulatedText,
                  finishReason: "stop",
                });
              }
            })
            .catch((error) => {
              if (!(abortSignal?.aborted ?? false)) {
                errorSubscription.remove();
                partialSubscription.remove();
                reject(error);
              }
            });
        } else {
          // Synchronous generation
          MediaPipeLlm.generateResponse(
            modelHandle,
            requestId,
            formattedChat.prompt
          )
            .then((result) => {
              partialSubscription.remove();
              errorSubscription.remove();
              resolve({
                text: result,
                finishReason: "stop",
              });
            })
            .catch((error) => {
              partialSubscription.remove();
              errorSubscription.remove();
              reject(error);
            });
        }
      });
    },
    [modelHandle, modelName]
  );

  return React.useMemo(
    () => ({
      // OpenAI-compatible API
      completion,
      clearContext,
      getModelInfo,
      // Legacy API
      generateResponse,
      generateStreamingResponse,
      addImage,
      addAudio,
      isLoaded: modelHandle !== undefined,
      // Download-specific
      downloadModel: downloadModelHandler,
      loadModel: loadModelHandler,
      downloadStatus,
      downloadProgress,
      downloadError,
      isCheckingStatus,
    }),
    [
      completion,
      clearContext,
      getModelInfo,
      generateResponse,
      generateStreamingResponse,
      addImage,
      addAudio,
      modelHandle,
      downloadModelHandler,
      loadModelHandler,
      downloadStatus,
      downloadProgress,
      downloadError,
      isCheckingStatus,
    ]
  );
}

// Internal implementation for Asset/File models
function _useLLMBase(props: UseLLMAssetProps | UseLLMFileProps): BaseLlmReturn {
  const [modelHandle, setModelHandle] = React.useState<number | undefined>();
  const nextRequestIdRef = React.useRef(0);

  const {
    maxTokens,
    topK,
    temperature,
    randomSeed,
    enableVisionModality,
    enableAudioModality,
    maxNumImages,
  } = props;
  let modelIdentifier: string | undefined;
  let storageType: "asset" | "file" | undefined;

  if (props.storageType === "asset") {
    modelIdentifier = props.modelName;
    storageType = props.storageType;
  } else if (props.storageType === "file") {
    modelIdentifier = props.modelPath;
    storageType = props.storageType;
  }

  React.useEffect(() => {
    if (!storageType || !modelIdentifier) {
      if (modelHandle !== undefined) setModelHandle(undefined);
      return;
    }

    const currentConfigStorageKey = modelIdentifier;
    const currentStorageType = storageType;

    console.log(
      `Attempting to create non-downloadable model: ${currentConfigStorageKey}, type: ${currentStorageType}`
    );

    const multimodalOptions = {
      enableVisionModality,
      enableAudioModality,
      maxNumImages,
    };

    let active = true;
    const modelCreatePromise =
      currentStorageType === "asset"
        ? MediaPipeLlm.createModelFromAsset(
            currentConfigStorageKey,
            maxTokens ?? 512,
            topK ?? 40,
            temperature ?? 0.8,
            randomSeed ?? 0,
            multimodalOptions
          )
        : MediaPipeLlm.createModel(
            currentConfigStorageKey,
            maxTokens ?? 512,
            topK ?? 40,
            temperature ?? 0.8,
            randomSeed ?? 0,
            multimodalOptions
          );

    modelCreatePromise
      .then((handle: number) => {
        if (active) {
          console.log(
            `Created non-downloadable model with handle ${handle} for ${currentConfigStorageKey}`
          );
          setModelHandle(handle);
        } else {
          MediaPipeLlm.releaseModel(handle).catch((e) =>
            console.error(
              "Error releasing model from stale promise (non-downloadable)",
              e
            )
          );
        }
      })
      .catch((error: Error) => {
        if (active) {
          console.error(
            `createModel error for ${currentConfigStorageKey} (non-downloadable):`,
            error
          );
          setModelHandle(undefined);
        }
      });

    return () => {
      active = false;
    };
  }, [
    modelIdentifier,
    storageType,
    maxTokens,
    topK,
    temperature,
    randomSeed,
    enableVisionModality,
    enableAudioModality,
    maxNumImages,
  ]);

  React.useEffect(() => {
    const currentModelHandle = modelHandle;
    return () => {
      if (currentModelHandle !== undefined) {
        console.log(`Releasing base model with handle ${currentModelHandle}.`);
        MediaPipeLlm.releaseModel(currentModelHandle)
          .then(() =>
            console.log(`Successfully released model ${currentModelHandle}`)
          )
          .catch((error) =>
            console.error(`Error releasing model ${currentModelHandle}:`, error)
          );
      }
    };
  }, [modelHandle]);

  const generateResponse = React.useCallback(
    async (
      promptText: string,
      onPartial?: (partial: string, reqId: number | undefined) => void,
      onErrorCb?: (message: string, reqId: number | undefined) => void,
      abortSignal?: AbortSignal
    ): Promise<string> => {
      if (modelHandle === undefined) {
        throw new Error(
          "Model handle is not defined. Ensure model is created/loaded."
        );
      }
      const requestId = nextRequestIdRef.current++;

      const partialSub = MediaPipeLlm.addListener(
        "onPartialResponse",
        (ev: PartialResponseEventPayload) => {
          if (
            onPartial &&
            requestId === ev.requestId &&
            ev.handle === modelHandle &&
            !(abortSignal?.aborted ?? false)
          ) {
            onPartial(ev.response, ev.requestId);
          }
        }
      );
      const errorSub = MediaPipeLlm.addListener(
        "onErrorResponse",
        (ev: ErrorResponseEventPayload) => {
          if (
            onErrorCb &&
            requestId === ev.requestId &&
            ev.handle === modelHandle &&
            !(abortSignal?.aborted ?? false)
          ) {
            onErrorCb(ev.error, ev.requestId);
          }
        }
      );

      try {
        return await MediaPipeLlm.generateResponse(
          modelHandle,
          requestId,
          promptText
        );
      } catch (e) {
        console.error("Generate response error:", e);
        if (onErrorCb && !(abortSignal?.aborted ?? false)) {
          onErrorCb(e instanceof Error ? e.message : String(e), requestId);
        }
        throw e;
      } finally {
        partialSub.remove();
        errorSub.remove();
      }
    },
    [modelHandle]
  );

  const generateStreamingResponse = React.useCallback(
    async (
      promptText: string,
      onPartial?: (partial: string, reqId: number) => void,
      onErrorCb?: (message: string, reqId: number) => void,
      abortSignal?: AbortSignal
    ): Promise<void> => {
      if (modelHandle === undefined) {
        throw new Error(
          "Model handle is not defined. Ensure model is created/loaded."
        );
      }
      const requestId = nextRequestIdRef.current++;

      return new Promise<void>((resolve, reject) => {
        const partialSubscription = MediaPipeLlm.addListener(
          "onPartialResponse",
          (ev: PartialResponseEventPayload) => {
            if (
              ev.handle === modelHandle &&
              ev.requestId === requestId &&
              !(abortSignal?.aborted ?? false)
            ) {
              if (onPartial) onPartial(ev.response, ev.requestId);
            }
          }
        );
        const errorSubscription = MediaPipeLlm.addListener(
          "onErrorResponse",
          (ev: ErrorResponseEventPayload) => {
            if (
              ev.handle === modelHandle &&
              ev.requestId === requestId &&
              !(abortSignal?.aborted ?? false)
            ) {
              if (onErrorCb) onErrorCb(ev.error, ev.requestId);
              errorSubscription.remove();
              partialSubscription.remove();
              reject(new Error(ev.error));
            }
          }
        );

        if (abortSignal) {
          abortSignal.addEventListener("abort", () => {
            errorSubscription.remove();
            partialSubscription.remove();
            console.log(`Request ${requestId} aborted for base model.`);
            reject(new Error("Aborted"));
          });
        }

        MediaPipeLlm.generateResponseAsync(modelHandle, requestId, promptText)
          .then(() => {
            if (!(abortSignal?.aborted ?? false)) {
              errorSubscription.remove();
              partialSubscription.remove();
              resolve();
            }
          })
          .catch((error) => {
            if (!(abortSignal?.aborted ?? false)) {
              errorSubscription.remove();
              partialSubscription.remove();
              if (onErrorCb) {
                onErrorCb(
                  error instanceof Error ? error.message : String(error),
                  requestId
                );
              }
              reject(error);
            }
          });
      });
    },
    [modelHandle]
  );

  const addImage = React.useCallback(
    async (imagePath: string): Promise<boolean> => {
      if (modelHandle === undefined) {
        throw new Error(
          "Model handle is not defined. Ensure model is created/loaded."
        );
      }
      return MediaPipeLlm.addImageToSession(modelHandle, imagePath);
    },
    [modelHandle]
  );

  const addAudio = React.useCallback(
    async (audioPath: string): Promise<boolean> => {
      if (modelHandle === undefined) {
        throw new Error(
          "Model handle is not defined. Ensure model is created/loaded."
        );
      }
      return MediaPipeLlm.addAudioToSession(modelHandle, audioPath);
    },
    [modelHandle]
  );

  // Model info (memoized)
  const modelInfo = React.useMemo<ModelInfo | null>(() => {
    if (!modelIdentifier) return null;
    return createModelInfo(
      modelIdentifier,
      enableVisionModality,
      enableAudioModality
    );
  }, [modelIdentifier, enableVisionModality, enableAudioModality]);

  const getModelInfo = React.useCallback((): ModelInfo | null => {
    return modelInfo;
  }, [modelInfo]);

  // Clear context/session
  const clearContext = React.useCallback(async (): Promise<void> => {
    if (modelHandle === undefined) {
      throw new Error(
        "Model handle is not defined. Ensure model is created/loaded."
      );
    }
    await MediaPipeLlm.clearSession(modelHandle);
  }, [modelHandle]);

  // =========================================================================
  // OpenAI-compatible completion method
  // =========================================================================
  const completion = React.useCallback(
    async (
      options: CompletionOptions,
      onToken?: StreamCallback,
      abortSignal?: AbortSignal
    ): Promise<CompletionResult> => {
      if (modelHandle === undefined) {
        throw new Error(
          "Model handle is not defined. Ensure model is created/loaded."
        );
      }

      const requestId = nextRequestIdRef.current++;

      // Format messages to prompt and extract multimodal content
      const template = detectTemplate(modelIdentifier || "");
      const formattedChat = formatChatMessages(options, template);

      // Add multimodal content to session
      await addMediaToSession(modelHandle, formattedChat);

      // Track accumulated text for streaming
      let accumulatedText = "";

      return new Promise<CompletionResult>((resolve, reject) => {
        const partialSubscription = MediaPipeLlm.addListener(
          "onPartialResponse",
          (ev: PartialResponseEventPayload) => {
            if (
              ev.handle === modelHandle &&
              ev.requestId === requestId &&
              !(abortSignal?.aborted ?? false)
            ) {
              accumulatedText += ev.response;
              if (onToken) {
                onToken({ token: ev.response, text: accumulatedText });
              }
            }
          }
        );

        const errorSubscription = MediaPipeLlm.addListener(
          "onErrorResponse",
          (ev: ErrorResponseEventPayload) => {
            if (
              ev.handle === modelHandle &&
              ev.requestId === requestId &&
              !(abortSignal?.aborted ?? false)
            ) {
              errorSubscription.remove();
              partialSubscription.remove();
              reject(new Error(ev.error));
            }
          }
        );

        if (abortSignal) {
          abortSignal.addEventListener("abort", () => {
            errorSubscription.remove();
            partialSubscription.remove();
            reject(new Error("Aborted"));
          });
        }

        // Use streaming if onToken callback is provided, otherwise sync
        if (onToken) {
          MediaPipeLlm.generateResponseAsync(
            modelHandle,
            requestId,
            formattedChat.prompt
          )
            .then(() => {
              if (!(abortSignal?.aborted ?? false)) {
                errorSubscription.remove();
                partialSubscription.remove();
                resolve({
                  text: accumulatedText,
                  finishReason: "stop",
                });
              }
            })
            .catch((error) => {
              if (!(abortSignal?.aborted ?? false)) {
                errorSubscription.remove();
                partialSubscription.remove();
                reject(error);
              }
            });
        } else {
          // Synchronous generation
          MediaPipeLlm.generateResponse(
            modelHandle,
            requestId,
            formattedChat.prompt
          )
            .then((result) => {
              partialSubscription.remove();
              errorSubscription.remove();
              resolve({
                text: result,
                finishReason: "stop",
              });
            })
            .catch((error) => {
              partialSubscription.remove();
              errorSubscription.remove();
              reject(error);
            });
        }
      });
    },
    [modelHandle, modelIdentifier]
  );

  return React.useMemo(
    () => ({
      // OpenAI-compatible API
      completion,
      clearContext,
      getModelInfo,
      // Legacy API
      generateResponse,
      generateStreamingResponse,
      addImage,
      addAudio,
      isLoaded: modelHandle !== undefined,
    }),
    [
      completion,
      clearContext,
      getModelInfo,
      generateResponse,
      generateStreamingResponse,
      addImage,
      addAudio,
      modelHandle,
    ]
  );
}

/**
 * Generate a streaming text response from the LLM.
 * This is an independent utility function.
 */
export function generateStreamingText(
  modelHandle: number,
  prompt: string,
  onPartialResponse?: (text: string, requestId: number) => void,
  onError?: (error: string, requestId: number) => void,
  abortSignal?: AbortSignal
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!modelHandle && modelHandle !== 0) {
      reject(
        new Error("Invalid model handle provided to generateStreamingText.")
      );
      return;
    }

    const requestId = Math.floor(Math.random() * 1000000);

    const partialSubscription = MediaPipeLlm.addListener(
      "onPartialResponse",
      (ev: PartialResponseEventPayload) => {
        if (
          ev.handle === modelHandle &&
          ev.requestId === requestId &&
          !(abortSignal?.aborted ?? false)
        ) {
          if (onPartialResponse) {
            onPartialResponse(ev.response, ev.requestId);
          }
        }
      }
    );

    const errorSubscription = MediaPipeLlm.addListener(
      "onErrorResponse",
      (ev: ErrorResponseEventPayload) => {
        if (
          ev.handle === modelHandle &&
          ev.requestId === requestId &&
          !(abortSignal?.aborted ?? false)
        ) {
          if (onError) {
            onError(ev.error, ev.requestId);
          }
          errorSubscription.remove();
          partialSubscription.remove();
          reject(new Error(ev.error));
        }
      }
    );

    if (abortSignal) {
      abortSignal.addEventListener("abort", () => {
        try {
          partialSubscription.remove();
        } catch {
          // Ignore
        }
        try {
          errorSubscription.remove();
        } catch {
          // Ignore
        }
        console.log(`generateStreamingText Request ${requestId} aborted.`);
        reject(new Error("Aborted"));
      });
    }

    MediaPipeLlm.generateResponseAsync(modelHandle, requestId, prompt)
      .then(() => {
        if (!(abortSignal?.aborted ?? false)) {
          partialSubscription.remove();
          errorSubscription.remove();
          resolve();
        }
      })
      .catch((error) => {
        if (!(abortSignal?.aborted ?? false)) {
          partialSubscription.remove();
          errorSubscription.remove();
          if (onError) {
            onError(
              error instanceof Error ? error.message : String(error),
              requestId
            );
          }
          reject(error);
        }
      });
  });
}

export default MediaPipeLlm;
