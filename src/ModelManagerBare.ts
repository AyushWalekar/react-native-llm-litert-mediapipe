/**
 * ModelManager for bare React Native
 * Manages the lifecycle of LLM models (downloading, deleting, status tracking)
 */
import { DownloadProgressEvent } from "./MediaPipeLlm.types";
import MediaPipeLlm from "./NativeMediaPipeLlm";

export interface ModelInfo {
  name: string;
  url: string;
  size?: number;
  status: "not_downloaded" | "downloading" | "downloaded" | "error";
  progress?: number;
  error?: string;
}

export interface DownloadOptions {
  overwrite?: boolean;
  headers?: Record<string, string>;
  timeout?: number;
}

/**
 * ModelManager is a singleton class that manages the lifecycle of models.
 * It handles downloading, deleting, and checking the status of models.
 * It also provides a way to listen for model status changes.
 */
export class ModelManager {
  private models: Map<string, ModelInfo> = new Map();
  private listeners: ((models: Map<string, ModelInfo>) => void)[] = [];
  private downloadSubscription?: { remove: () => void };

  constructor() {
    // Set up download progress listener
    this.downloadSubscription = MediaPipeLlm.addListener(
      "downloadProgress",
      this.handleDownloadProgress
    );
  }

  private handleDownloadProgress = (event: DownloadProgressEvent) => {
    const { modelName, progress, status, error } = event;

    // Update model info
    const model = this.models.get(modelName);
    if (model) {
      model.status =
        status === "completed"
          ? "downloaded"
          : status === "error"
          ? "error"
          : status === "downloading"
          ? "downloading"
          : "not_downloaded";

      if (progress !== undefined) {
        model.progress = progress;
      }

      if (error) {
        model.error = error;
      }

      // Save updated model info
      this.models.set(modelName, model);

      // Notify listeners
      this.notifyListeners();
    }
  };

  /**
   * Registers a model with the manager.
   * @param name - The name of the model.
   * @param url - The URL to download the model from.
   */
  public registerModel(name: string, url: string): void {
    if (!this.models.has(name)) {
      this.models.set(name, {
        name,
        url,
        status: "not_downloaded",
      });

      // Check if it's already downloaded
      this.checkModelStatus(name);
    }
  }

  private async checkModelStatus(modelName: string): Promise<void> {
    try {
      const isDownloaded = await MediaPipeLlm.isModelDownloaded(modelName);
      const model = this.models.get(modelName);

      if (model) {
        model.status = isDownloaded ? "downloaded" : "not_downloaded";
        this.models.set(modelName, model);
        this.notifyListeners();
      }
    } catch (error) {
      console.error(`Error checking model status: ${error}`);
    }
  }

  /**
   * Downloads a model.
   * @param modelName - The name of the model to download.
   * @param options - Optional download options.
   * @returns A promise that resolves to true if the download was successful.
   */
  public async downloadModel(
    modelName: string,
    options?: DownloadOptions
  ): Promise<boolean> {
    const model = this.models.get(modelName);
    if (!model) {
      throw new Error(`Model ${modelName} is not registered`);
    }

    try {
      // Update status to downloading
      model.status = "downloading";
      model.progress = 0;
      this.models.set(modelName, model);
      this.notifyListeners();

      // Prepare download options with defaults
      const downloadOptions = {
        overwrite: false,
        ...options,
      };

      // Start download with options
      const result = await MediaPipeLlm.downloadModel(
        model.url,
        modelName,
        downloadOptions
      );
      return result;
    } catch (error) {
      // Update status to error
      model.status = "error";
      model.error = error instanceof Error ? error.message : String(error);
      this.models.set(modelName, model);
      this.notifyListeners();
      throw error;
    }
  }

  /**
   * Cancels a model download.
   * @param modelName - The name of the model to cancel.
   * @returns A promise that resolves to true if the cancellation was successful.
   */
  public async cancelDownload(modelName: string): Promise<boolean> {
    return MediaPipeLlm.cancelDownload(modelName);
  }

  /**
   * Deletes a downloaded model.
   * @param modelName - The name of the model to delete.
   * @returns A promise that resolves to true if the deletion was successful.
   */
  public async deleteModel(modelName: string): Promise<boolean> {
    const result = await MediaPipeLlm.deleteDownloadedModel(modelName);

    if (result) {
      const model = this.models.get(modelName);
      if (model) {
        model.status = "not_downloaded";
        model.progress = 0;
        model.error = undefined;
        this.models.set(modelName, model);
        this.notifyListeners();
      }
    }

    return result;
  }

  /**
   * Gets information about a specific model.
   * @param modelName - The name of the model.
   * @returns The model info or undefined if not registered.
   */
  public getModel(modelName: string): ModelInfo | undefined {
    return this.models.get(modelName);
  }

  /**
   * Gets information about all registered models.
   * @returns A map of model names to model info.
   */
  public getAllModels(): Map<string, ModelInfo> {
    return new Map(this.models);
  }

  /**
   * Adds a listener for model status changes.
   * @param listener - The callback to invoke when model status changes.
   * @returns A function to remove the listener.
   */
  public addListener(
    listener: (models: Map<string, ModelInfo>) => void
  ): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index !== -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  private notifyListeners(): void {
    const modelsCopy = new Map(this.models);
    this.listeners.forEach((listener) => listener(modelsCopy));
  }

  /**
   * Cleans up resources when the manager is no longer needed.
   */
  public destroy(): void {
    if (this.downloadSubscription) {
      this.downloadSubscription.remove();
      this.downloadSubscription = undefined;
    }
    this.listeners = [];
    this.models.clear();
  }
}

// Singleton instance
export const modelManager = new ModelManager();
