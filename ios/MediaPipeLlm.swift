/**
 * MediaPipeLlm.swift
 * Bare React Native native module for MediaPipe LLM inference
 */

import Foundation
import MediaPipeTasksGenAI

@objc(MediaPipeLlm)
class MediaPipeLlm: RCTEventEmitter {

    private var modelMap = [Int: LlmInferenceModelBare]()
    private var nextHandle = 1
    private var activeDownloads: [String: URLSessionDownloadTask] = [:]
    private var downloadObservers: [String: NSKeyValueObservation] = [:]
    private var hasListeners = false

    override init() {
        super.init()
    }

    @objc override static func requiresMainQueueSetup() -> Bool {
        return false
    }

    override func supportedEvents() -> [String]! {
        return ["downloadProgress", "onChange", "onPartialResponse", "onErrorResponse", "logging"]
    }

    override func startObserving() {
        hasListeners = true
    }

    override func stopObserving() {
        hasListeners = false
    }

    private func emitEvent(_ eventName: String, _ body: [String: Any]) {
        if hasListeners {
            sendEvent(withName: eventName, body: body)
        }
    }

    // MARK: - Model Directory Management

    private func getModelDirectory() -> URL {
        let fileManager = FileManager.default
        let documentsURL = fileManager.urls(for: .documentDirectory, in: .userDomainMask)[0]
        let modelDirURL = documentsURL.appendingPathComponent("llm_models")
        if !fileManager.fileExists(atPath: modelDirURL.path) {
            try? fileManager.createDirectory(at: modelDirURL, withIntermediateDirectories: true)
        }
        return modelDirURL
    }

    private func getModelURL(modelName: String) -> URL {
        return getModelDirectory().appendingPathComponent(modelName)
    }

    // MARK: - Model Creation

    @objc(createModel:maxTokens:topK:temperature:randomSeed:resolver:rejecter:)
    func createModel(
        _ modelPath: String, maxTokens: Int, topK: Int, temperature: Double, randomSeed: Int,
        resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock
    ) {
        do {
            let modelHandle = nextHandle
            nextHandle += 1
            let model = try LlmInferenceModelBare(
                modelPath: modelPath,
                maxTokens: maxTokens,
                topK: topK,
                temperature: Float(temperature),
                randomSeed: randomSeed,
                eventEmitter: { [weak self] eventName, params in
                    self?.emitEvent(eventName, params)
                },
                modelHandle: modelHandle
            )
            modelMap[modelHandle] = model
            resolve(modelHandle)
        } catch {
            reject("MODEL_ERROR", "Failed to create model: \(error)", error)
        }
    }

    @objc(createModelFromAsset:maxTokens:topK:temperature:randomSeed:resolver:rejecter:)
    func createModelFromAsset(
        _ modelName: String, maxTokens: Int, topK: Int, temperature: Double, randomSeed: Int,
        resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock
    ) {
        guard let modelURL = Bundle.main.url(forResource: modelName, withExtension: nil) else {
            reject("MODEL_NOT_FOUND", "Model not found in app bundle: \(modelName)", nil)
            return
        }
        createModel(
            modelURL.path, maxTokens: maxTokens, topK: topK, temperature: temperature,
            randomSeed: randomSeed,
            resolve: resolve, reject: reject)
    }

    @objc(releaseModel:resolver:rejecter:)
    func releaseModel(
        _ handle: Int, resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        if modelMap[handle] != nil {
            modelMap.removeValue(forKey: handle)
            resolve(true)
        } else {
            reject("INVALID_HANDLE", "No model found for handle \(handle)", nil)
        }
    }

    // MARK: - Generation

    @objc(generateResponse:requestId:prompt:resolver:rejecter:)
    func generateResponse(
        _ handle: Int, requestId: Int, prompt: String,
        resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock
    ) {
        guard let model = modelMap[handle] else {
            reject("INVALID_HANDLE", "No model found for handle \(handle)", nil)
            return
        }
        do {
            try model.generateResponse(requestId: requestId, prompt: prompt) { result in
                switch result {
                case .success(let response):
                    resolve(response)
                case .failure(let error):
                    reject("GENERATION_ERROR", error.localizedDescription, error)
                }
            }
        } catch {
            reject(
                "GENERATION_ERROR", "Failed to generate response: \(error.localizedDescription)",
                error)
        }
    }

    @objc(generateResponseAsync:requestId:prompt:resolver:rejecter:)
    func generateResponseAsync(
        _ handle: Int, requestId: Int, prompt: String,
        resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock
    ) {
        guard let model = modelMap[handle] else {
            reject("INVALID_HANDLE", "No model found for handle \(handle)", nil)
            return
        }
        do {
            try model.generateStreamingResponse(requestId: requestId, prompt: prompt) { completed in
                if completed {
                    resolve(true)
                } else {
                    reject("GENERATION_INCOMPLETE", "Generation did not complete successfully", nil)
                }
            }
        } catch {
            reject(
                "GENERATION_ERROR", "Failed to generate response: \(error.localizedDescription)",
                error)
        }
    }

    // MARK: - Download Management

    @objc(isModelDownloaded:resolver:rejecter:)
    func isModelDownloaded(
        _ modelName: String, resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        let modelURL = getModelURL(modelName: modelName)
        let exists = FileManager.default.fileExists(atPath: modelURL.path)
        resolve(exists)
    }

    @objc(getDownloadedModels:rejecter:)
    func getDownloadedModels(
        _ resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock
    ) {
        let modelDir = getModelDirectory()
        do {
            let fileURLs = try FileManager.default.contentsOfDirectory(
                at: modelDir, includingPropertiesForKeys: nil)
            let modelNames = fileURLs.map { $0.lastPathComponent }
            resolve(modelNames)
        } catch {
            resolve([])
        }
    }

    @objc(deleteDownloadedModel:resolver:rejecter:)
    func deleteDownloadedModel(
        _ modelName: String, resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        let modelURL = getModelURL(modelName: modelName)
        do {
            try FileManager.default.removeItem(at: modelURL)
            resolve(true)
        } catch {
            resolve(false)
        }
    }

    @objc(downloadModel:modelName:options:resolver:rejecter:)
    func downloadModel(
        _ url: String, modelName: String, options: NSDictionary?,
        resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock
    ) {
        let modelURL = self.getModelURL(modelName: modelName)
        let overwrite = options?["overwrite"] as? Bool ?? false

        // Check if already downloading
        if self.activeDownloads[modelName] != nil {
            reject("ERR_ALREADY_DOWNLOADING", "This model is already being downloaded", nil)
            return
        }

        // Check if already exists
        if FileManager.default.fileExists(atPath: modelURL.path) && !overwrite {
            resolve(true)
            return
        }

        // Create URL session for download
        guard let downloadURL = URL(string: url) else {
            reject("ERR_INVALID_URL", "Invalid URL provided", nil)
            return
        }

        var request = URLRequest(url: downloadURL)

        // Add custom headers if provided
        if let headers = options?["headers"] as? [String: String] {
            for (key, value) in headers {
                request.setValue(value, forHTTPHeaderField: key)
            }
        }

        // Set timeout
        if let timeout = options?["timeout"] as? TimeInterval {
            request.timeoutInterval = timeout / 1000.0
        }

        // Create download task
        let session = URLSession(configuration: .default)
        let task = session.downloadTask(with: request) { [weak self] (tempURL, response, error) in
            guard let self = self else { return }

            // Remove from active downloads
            self.activeDownloads.removeValue(forKey: modelName)
            self.downloadObservers.removeValue(forKey: modelName)?.invalidate()

            if let error = error {
                self.emitEvent(
                    "downloadProgress",
                    [
                        "modelName": modelName,
                        "url": url,
                        "status": "error",
                        "error": error.localizedDescription,
                    ])
                reject("ERR_DOWNLOAD", "Download failed: \(error.localizedDescription)", error)
                return
            }

            guard let tempURL = tempURL else {
                self.emitEvent(
                    "downloadProgress",
                    [
                        "modelName": modelName,
                        "url": url,
                        "status": "error",
                        "error": "No file downloaded",
                    ])
                reject("ERR_DOWNLOAD", "Download failed: No file received", nil)
                return
            }

            do {
                // If file already exists, remove it
                if FileManager.default.fileExists(atPath: modelURL.path) {
                    try FileManager.default.removeItem(at: modelURL)
                }

                // Move downloaded file to final location
                try FileManager.default.moveItem(at: tempURL, to: modelURL)

                let fileSize =
                    (try? FileManager.default.attributesOfItem(atPath: modelURL.path)[.size]
                        as? Int64) ?? 0

                self.emitEvent(
                    "downloadProgress",
                    [
                        "modelName": modelName,
                        "url": url,
                        "bytesDownloaded": fileSize,
                        "totalBytes": fileSize,
                        "progress": 1.0,
                        "status": "completed",
                    ])

                resolve(true)
            } catch {
                self.emitEvent(
                    "downloadProgress",
                    [
                        "modelName": modelName,
                        "url": url,
                        "status": "error",
                        "error": error.localizedDescription,
                    ])
                reject(
                    "ERR_SAVE_FILE",
                    "Failed to save downloaded model: \(error.localizedDescription)", error)
            }
        }

        // Observe download progress
        let observation = task.progress.observe(\.fractionCompleted) { [weak self] progress, _ in
            guard let self = self else { return }
            DispatchQueue.main.async {
                self.emitEvent(
                    "downloadProgress",
                    [
                        "modelName": modelName,
                        "url": url,
                        "bytesDownloaded": task.countOfBytesReceived,
                        "totalBytes": task.countOfBytesExpectedToReceive,
                        "progress": progress.fractionCompleted,
                        "status": "downloading",
                    ])
            }
        }

        // Store task and observer
        self.activeDownloads[modelName] = task
        self.downloadObservers[modelName] = observation

        // Start download
        task.resume()
    }

    @objc(cancelDownload:resolver:rejecter:)
    func cancelDownload(
        _ modelName: String, resolve: @escaping RCTPromiseResolveBlock,
        reject: @escaping RCTPromiseRejectBlock
    ) {
        if let task = activeDownloads[modelName] {
            task.cancel()
            activeDownloads.removeValue(forKey: modelName)
            downloadObservers.removeValue(forKey: modelName)?.invalidate()
            emitEvent("downloadProgress", ["modelName": modelName, "status": "cancelled"])
            resolve(true)
        } else {
            resolve(false)
        }
    }

    @objc(
        createModelFromDownloaded:maxTokens:topK:temperature:randomSeed:options:resolver:rejecter:
    )
    func createModelFromDownloaded(
        _ modelName: String, maxTokens: NSNumber?, topK: NSNumber?,
        temperature: NSNumber?, randomSeed: NSNumber?, options: NSDictionary?,
        resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock
    ) {
        let modelURL = getModelURL(modelName: modelName)
        if !FileManager.default.fileExists(atPath: modelURL.path) {
            reject("ERR_MODEL_NOT_FOUND", "Model \(modelName) is not downloaded", nil)
            return
        }

        do {
            let handle = try createModelInternal(
                modelPath: modelURL.path,
                maxTokens: maxTokens?.intValue ?? 1024,
                topK: topK?.intValue ?? 40,
                temperature: temperature?.doubleValue ?? 0.7,
                randomSeed: randomSeed?.intValue ?? 42
            )
            resolve(handle)
        } catch {
            reject(
                "ERR_CREATE_MODEL", "Failed to create model: \(error.localizedDescription)", error)
        }
    }

    private func createModelInternal(
        modelPath: String, maxTokens: Int, topK: Int, temperature: Double, randomSeed: Int
    ) throws -> Int {
        let modelHandle = nextHandle
        nextHandle += 1
        let model = try LlmInferenceModelBare(
            modelPath: modelPath,
            maxTokens: maxTokens,
            topK: topK,
            temperature: Float(temperature),
            randomSeed: randomSeed,
            eventEmitter: { [weak self] eventName, params in
                self?.emitEvent(eventName, params)
            },
            modelHandle: modelHandle
        )
        modelMap[modelHandle] = model
        return modelHandle
    }

    // MARK: - Multimodal (Not supported on iOS)

    @objc(addImageToSession:imagePath:resolver:rejecter:)
    func addImageToSession(
        _ handle: Int, imagePath: String,
        resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock
    ) {
        reject(
            "PLATFORM_ERROR",
            "Multimodal image input is not supported on iOS. This feature is only available on Android.",
            nil)
    }

    @objc(addAudioToSession:audioPath:resolver:rejecter:)
    func addAudioToSession(
        _ handle: Int, audioPath: String,
        resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock
    ) {
        reject(
            "PLATFORM_ERROR",
            "Multimodal audio input is not supported on iOS. This feature is only available on Android.",
            nil)
    }
}
