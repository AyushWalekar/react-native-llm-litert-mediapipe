package com.mediapipellm

import android.content.Context
import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.*
import java.io.BufferedInputStream

private const val TAG = "MediaPipeLlm"

// Safe ReadableMap extension functions to avoid NoSuchKeyException
private fun ReadableMap.getBooleanSafe(key: String, default: Boolean = false): Boolean {
    return if (hasKey(key)) getBoolean(key) else default
}

private fun ReadableMap.getIntSafe(key: String, default: Int): Int {
    return if (hasKey(key)) getInt(key) else default
}
private const val DOWNLOAD_DIRECTORY = "llm_models"

class MediaPipeLlmModule(reactContext: ReactApplicationContext) : 
    ReactContextBaseJavaModule(reactContext) {

    private var nextHandle = 1
    private val engineMap = mutableMapOf<Int, LlmEngine>()
    private val activeDownloads = mutableMapOf<String, Job>()
    private val coroutineScope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    override fun getName(): String = "MediaPipeLlm"

    // Event emission helper
    private fun sendEvent(eventName: String, params: WritableMap) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    private fun sendEvent(eventName: String, params: Map<String, Any?>) {
        val writableMap = Arguments.createMap()
        params.forEach { (key, value) ->
            when (value) {
                is String -> writableMap.putString(key, value)
                is Int -> writableMap.putInt(key, value)
                is Double -> writableMap.putDouble(key, value)
                is Boolean -> writableMap.putBoolean(key, value)
                is Long -> writableMap.putDouble(key, value.toDouble())
                null -> writableMap.putNull(key)
                else -> writableMap.putString(key, value.toString())
            }
        }
        sendEvent(eventName, writableMap)
    }

    // Required for RCTEventEmitter
    @ReactMethod
    fun addListener(eventName: String) {
        // Keep: Required for RN built-in Event Emitter Calls
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Keep: Required for RN built-in Event Emitter Calls
    }

    // Create inference listener for a model handle
    private fun createInferenceListener(modelHandle: Int): InferenceListener {
        return object : InferenceListener {
            override fun logging(message: String) {
                sendEvent("logging", mapOf(
                    "handle" to modelHandle,
                    "message" to message
                ))
            }

            override fun onError(requestId: Int, error: String) {
                sendEvent("onErrorResponse", mapOf(
                    "handle" to modelHandle,
                    "requestId" to requestId,
                    "error" to error
                ))
            }

            override fun onResults(requestId: Int, response: String) {
                sendEvent("onPartialResponse", mapOf(
                    "handle" to modelHandle,
                    "requestId" to requestId,
                    "response" to response
                ))
            }
        }
    }

    private fun copyFileToInternalStorageIfNeeded(modelName: String, context: Context): File {
        val outputFile = File(context.filesDir, modelName)

        if (outputFile.exists()) {
            sendEvent("logging", mapOf(
                "message" to "File already exists: ${outputFile.path}, size: ${outputFile.length()}"
            ))
            return outputFile
        }

        try {
            val assetList = context.assets.list("") ?: arrayOf()
            sendEvent("logging", mapOf(
                "message" to "Available assets: ${assetList.joinToString()}"
            ))

            if (!assetList.contains(modelName)) {
                val errorMsg = "Asset file $modelName does not exist in assets"
                sendEvent("logging", mapOf("message" to errorMsg))
                throw IllegalArgumentException(errorMsg)
            }

            sendEvent("logging", mapOf(
                "message" to "Copying asset $modelName to ${outputFile.path}"
            ))

            context.assets.open(modelName).use { inputStream ->
                FileOutputStream(outputFile).use { outputStream ->
                    val buffer = ByteArray(1024)
                    var read: Int
                    var total = 0

                    while (inputStream.read(buffer).also { read = it } != -1) {
                        outputStream.write(buffer, 0, read)
                        total += read

                        if (total % (1024 * 1024) == 0) {
                            sendEvent("logging", mapOf(
                                "message" to "Copied $total bytes so far"
                            ))
                        }
                    }

                    sendEvent("logging", mapOf(
                        "message" to "Copied $total bytes total"
                    ))
                }
            }
        } catch (e: Exception) {
            sendEvent("logging", mapOf(
                "message" to "Error copying file: ${e.message}"
            ))
            throw e
        }

        return outputFile
    }

    private fun getModelDirectory(): File {
        val modelDir = File(reactApplicationContext.filesDir, DOWNLOAD_DIRECTORY)
        if (!modelDir.exists()) {
            modelDir.mkdirs()
        }
        return modelDir
    }

    private fun getModelFile(modelName: String): File {
        return File(getModelDirectory(), modelName)
    }

    /**
     * Determine which engine to use based on file extension.
     * .litertlm -> LiteRtLmEngine (supports audio)
     * .task -> MediaPipeLlmEngine (MediaPipe tasks-genai)
     */
    private fun isLiteRtLmModel(modelPath: String): Boolean {
        return modelPath.endsWith(".litertlm", ignoreCase = true)
    }

    /**
     * Create the appropriate LLM engine based on model file extension.
     */
    private fun createEngine(
        modelHandle: Int,
        config: LlmEngineConfig
    ): LlmEngine {
        val listener = createInferenceListener(modelHandle)
        val isLiteRt = isLiteRtLmModel(config.modelPath)
        
        sendEvent("logging", mapOf(
            "handle" to modelHandle,
            "message" to "Creating ${if (isLiteRt) "LiteRT-LM" else "MediaPipe"} engine for: ${config.modelPath}"
        ))
        
        return if (isLiteRt) {
            LiteRtLmEngine(reactApplicationContext, config, listener)
        } else {
            MediaPipeLlmEngine(reactApplicationContext, config, listener)
        }
    }

    private fun createEngineInternal(
        modelPath: String,
        maxTokens: Int,
        topK: Int,
        temperature: Double,
        randomSeed: Int,
        enableVisionModality: Boolean = false,
        enableAudioModality: Boolean = false,
        maxNumImages: Int = 10
    ): Int {
        val modelHandle = nextHandle++
        
        val config = LlmEngineConfig(
            modelPath = modelPath,
            maxTokens = maxTokens,
            topK = topK,
            temperature = temperature.toFloat(),
            randomSeed = randomSeed,
            enableVisionModality = enableVisionModality,
            enableAudioModality = enableAudioModality,
            maxNumImages = maxNumImages
        )
        
        val engine = createEngine(modelHandle, config)
        engineMap[modelHandle] = engine
        return modelHandle
    }

    @ReactMethod
    fun createModel(
        modelPath: String,
        maxTokens: Int,
        topK: Int,
        temperature: Double,
        randomSeed: Int,
        options: ReadableMap?,
        promise: Promise
    ) {
        try {
            val enableVisionModality = options?.getBooleanSafe("enableVisionModality", false) ?: false
            val enableAudioModality = options?.getBooleanSafe("enableAudioModality", false) ?: false
            val maxNumImages = options?.getIntSafe("maxNumImages", 10) ?: 10

            sendEvent("logging", mapOf(
                "message" to "Creating model from path: $modelPath (vision=$enableVisionModality, audio=$enableAudioModality)"
            ))

            val handle = createEngineInternal(
                modelPath,
                maxTokens,
                topK,
                temperature,
                randomSeed,
                enableVisionModality = enableVisionModality,
                enableAudioModality = enableAudioModality,
                maxNumImages = maxNumImages
            )
            promise.resolve(handle)
        } catch (e: Exception) {
            sendEvent("logging", mapOf(
                "message" to "Model creation failed: ${e.message}"
            ))
            promise.reject("MODEL_CREATION_FAILED", e.message ?: "Unknown error", e)
        }
    }

    @ReactMethod
    fun createModelFromAsset(
        modelName: String,
        maxTokens: Int,
        topK: Int,
        temperature: Double,
        randomSeed: Int,
        options: ReadableMap?,
        promise: Promise
    ) {
        try {
            val enableVisionModality = options?.getBooleanSafe("enableVisionModality", false) ?: false
            val enableAudioModality = options?.getBooleanSafe("enableAudioModality", false) ?: false
            val maxNumImages = options?.getIntSafe("maxNumImages", 10) ?: 10

            sendEvent("logging", mapOf(
                "message" to "Creating model from asset: $modelName (vision=$enableVisionModality, audio=$enableAudioModality)"
            ))

            val modelPath = copyFileToInternalStorageIfNeeded(modelName, reactApplicationContext).path

            sendEvent("logging", mapOf(
                "message" to "Model file copied to: $modelPath"
            ))

            val handle = createEngineInternal(
                modelPath,
                maxTokens,
                topK,
                temperature,
                randomSeed,
                enableVisionModality = enableVisionModality,
                enableAudioModality = enableAudioModality,
                maxNumImages = maxNumImages
            )
            promise.resolve(handle)
        } catch (e: Exception) {
            sendEvent("logging", mapOf(
                "message" to "Model creation from asset failed: ${e.message}"
            ))
            promise.reject("MODEL_CREATION_FAILED", e.message ?: "Unknown error", e)
        }
    }

    @ReactMethod
    fun releaseModel(handle: Int, promise: Promise) {
        try {
            val engine = engineMap.remove(handle)
            if (engine != null) {
                engine.close()
                promise.resolve(true)
            } else {
                promise.reject("INVALID_HANDLE", "No model found for handle $handle", null)
            }
        } catch (e: Exception) {
            promise.reject("RELEASE_FAILED", e.message ?: "Unknown error", e)
        }
    }

    @ReactMethod
    fun generateResponse(handle: Int, requestId: Int, prompt: String, promise: Promise) {
        try {
            val engine = engineMap[handle]
            if (engine == null) {
                promise.reject("INVALID_HANDLE", "No model found for handle $handle", null)
                return
            }

            sendEvent("logging", mapOf(
                "handle" to handle,
                "message" to "Generating response with prompt: ${prompt.take(30)}..."
            ))

            val response = engine.generateResponse(requestId, prompt)
            promise.resolve(response)
        } catch (e: Exception) {
            sendEvent("logging", mapOf(
                "handle" to handle,
                "message" to "Generation error: ${e.message}"
            ))
            promise.reject("GENERATION_FAILED", e.message ?: "Unknown error", e)
        }
    }

    @ReactMethod
    fun generateResponseAsync(handle: Int, requestId: Int, prompt: String, promise: Promise) {
        try {
            val engine = engineMap[handle]
            if (engine == null) {
                promise.reject("INVALID_HANDLE", "No model found for handle $handle", null)
                return
            }

            sendEvent("logging", mapOf(
                "handle" to handle,
                "requestId" to requestId,
                "message" to "Starting async generation with prompt: ${prompt.take(30)}..."
            ))

            engine.generateResponseAsync(requestId, prompt) { result ->
                try {
                    if (result.isEmpty()) {
                        sendEvent("logging", mapOf(
                            "handle" to handle,
                            "requestId" to requestId,
                            "message" to "Generation completed but returned empty result"
                        ))
                        promise.reject("GENERATION_FAILED", "Failed to generate response", null)
                    } else {
                        sendEvent("logging", mapOf(
                            "handle" to handle,
                            "requestId" to requestId,
                            "message" to "Generation completed successfully with ${result.length} characters"
                        ))
                        promise.resolve(true)
                    }
                } catch (e: Exception) {
                    sendEvent("logging", mapOf(
                        "handle" to handle,
                        "requestId" to requestId,
                        "message" to "Error in async result callback: ${e.message}"
                    ))
                    promise.reject("GENERATION_ERROR", e.message ?: "Unknown error", e)
                }
            }
        } catch (e: Exception) {
            sendEvent("logging", mapOf(
                "handle" to handle,
                "message" to "Outer exception in generateResponseAsync: ${e.message}"
            ))
            promise.reject("GENERATION_ERROR", e.message ?: "Unknown error", e)
        }
    }

    @ReactMethod
    fun isModelDownloaded(modelName: String, promise: Promise) {
        val modelFile = getModelFile(modelName)
        promise.resolve(modelFile.exists() && modelFile.length() > 0)
    }

    @ReactMethod
    fun getDownloadedModels(promise: Promise) {
        val models = getModelDirectory().listFiles()?.map { it.name } ?: emptyList()
        val array = Arguments.createArray()
        models.forEach { array.pushString(it) }
        promise.resolve(array)
    }

    @ReactMethod
    fun deleteDownloadedModel(modelName: String, promise: Promise) {
        val modelFile = getModelFile(modelName)
        val result = if (modelFile.exists()) modelFile.delete() else false
        promise.resolve(result)
    }

    @ReactMethod
    fun downloadModel(url: String, modelName: String, options: ReadableMap?, promise: Promise) {
        val modelFile = getModelFile(modelName)
        val overwrite = options?.getBoolean("overwrite") ?: false

        if (activeDownloads.containsKey(modelName)) {
            promise.reject("ERR_ALREADY_DOWNLOADING", "This model is already being downloaded", null)
            return
        }

        if (modelFile.exists() && !overwrite) {
            promise.resolve(true)
            return
        }

        val downloadJob = coroutineScope.launch {
            try {
                val connection = URL(url).openConnection() as HttpURLConnection

                // Add custom headers if provided
                options?.getMap("headers")?.let { headers ->
                    val iterator = headers.keySetIterator()
                    while (iterator.hasNextKey()) {
                        val key = iterator.nextKey()
                        connection.setRequestProperty(key, headers.getString(key))
                    }
                }

                connection.connectTimeout = options?.getInt("timeout") ?: 30000
                connection.connect()

                val contentLength = connection.contentLength.toLong()
                val input = BufferedInputStream(connection.inputStream)
                val tempFile = File(modelFile.absolutePath + ".temp")
                val output = FileOutputStream(tempFile)

                val buffer = ByteArray(8192)
                var total: Long = 0
                var count: Int
                var lastUpdateTime = System.currentTimeMillis()

                while (input.read(buffer).also { count = it } != -1) {
                    if (!isActive) {
                        output.close()
                        input.close()
                        tempFile.delete()
                        sendEvent("downloadProgress", mapOf(
                            "modelName" to modelName,
                            "url" to url,
                            "status" to "cancelled"
                        ))
                        return@launch
                    }

                    total += count
                    output.write(buffer, 0, count)

                    val currentTime = System.currentTimeMillis()
                    if (currentTime - lastUpdateTime > 100) {
                        lastUpdateTime = currentTime
                        val progress = if (contentLength > 0) total.toDouble() / contentLength.toDouble() else 0.0
                        sendEvent("downloadProgress", mapOf(
                            "modelName" to modelName,
                            "url" to url,
                            "bytesDownloaded" to total,
                            "totalBytes" to contentLength,
                            "progress" to progress,
                            "status" to "downloading"
                        ))
                    }
                }

                output.flush()
                output.close()
                input.close()

                if (modelFile.exists()) {
                    modelFile.delete()
                }
                tempFile.renameTo(modelFile)

                sendEvent("downloadProgress", mapOf(
                    "modelName" to modelName,
                    "url" to url,
                    "bytesDownloaded" to modelFile.length(),
                    "totalBytes" to modelFile.length(),
                    "progress" to 1.0,
                    "status" to "completed"
                ))

                withContext(Dispatchers.Main) {
                    promise.resolve(true)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error downloading model: ${e.message}", e)
                sendEvent("downloadProgress", mapOf(
                    "modelName" to modelName,
                    "url" to url,
                    "status" to "error",
                    "error" to (e.message ?: "Unknown error")
                ))
                withContext(Dispatchers.Main) {
                    promise.reject("ERR_DOWNLOAD", "Failed to download model: ${e.message}", e)
                }
            } finally {
                activeDownloads.remove(modelName)
            }
        }

        activeDownloads[modelName] = downloadJob
    }

    @ReactMethod
    fun cancelDownload(modelName: String, promise: Promise) {
        val job = activeDownloads[modelName]
        if (job != null) {
            job.cancel()
            activeDownloads.remove(modelName)
            promise.resolve(true)
        } else {
            promise.resolve(false)
        }
    }

    @ReactMethod
    fun createModelFromDownloaded(
        modelName: String,
        maxTokens: Int?,
        topK: Int?,
        temperature: Double?,
        randomSeed: Int?,
        options: ReadableMap?,
        promise: Promise
    ) {
        val modelFile = getModelFile(modelName)

        if (!modelFile.exists()) {
            promise.reject("ERR_MODEL_NOT_FOUND", "Model $modelName is not downloaded", null)
            return
        }

        val enableVisionModality = options?.getBooleanSafe("enableVisionModality", false) ?: false
        val enableAudioModality = options?.getBooleanSafe("enableAudioModality", false) ?: false
        val maxNumImages = options?.getIntSafe("maxNumImages", 10) ?: 10

        try {
            val handle = createEngineInternal(
                modelFile.absolutePath,
                maxTokens ?: 1024,
                topK ?: 40,
                temperature ?: 0.7,
                randomSeed ?: 42,
                enableVisionModality = enableVisionModality,
                enableAudioModality = enableAudioModality,
                maxNumImages = maxNumImages
            )
            promise.resolve(handle)
        } catch (e: Exception) {
            Log.e(TAG, "Error creating model from downloaded file: ${e.message}", e)
            promise.reject("ERR_CREATE_MODEL", "Failed to create model: ${e.message}", e)
        }
    }

    @ReactMethod
    fun addImageToSession(handle: Int, imagePath: String, promise: Promise) {
        try {
            val engine = engineMap[handle]
            if (engine == null) {
                promise.reject("INVALID_HANDLE", "No model found for handle $handle", null)
                return
            }

            engine.addImage(imagePath)
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Error adding image to session: ${e.message}", e)
            promise.reject("ERR_ADD_IMAGE", "Failed to add image: ${e.message}", e)
        }
    }

    @ReactMethod
    fun addAudioToSession(handle: Int, audioPath: String, promise: Promise) {
        try {
            val engine = engineMap[handle]
            if (engine == null) {
                promise.reject("INVALID_HANDLE", "No model found for handle $handle", null)
                return
            }

            engine.addAudio(audioPath)
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Error adding audio to session: ${e.message}", e)
            promise.reject("ERR_ADD_AUDIO", "Failed to add audio: ${e.message}", e)
        }
    }

    @ReactMethod
    fun stopGeneration(handle: Int, promise: Promise) {
        try {
            val engine = engineMap[handle]
            if (engine == null) {
                promise.reject("INVALID_HANDLE", "No model found for handle $handle", null)
                return
            }

            engine.cancelGeneration()
            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Error stopping generation: ${e.message}", e)
            promise.reject("ERR_STOP_GENERATION", "Failed to stop generation: ${e.message}", e)
        }
    }

    @Suppress("DEPRECATION")
    @Deprecated("Deprecated in Java", ReplaceWith("Lifecycle management"))
    override fun onCatalystInstanceDestroy() {
        super.onCatalystInstanceDestroy()
        coroutineScope.cancel()
        engineMap.values.forEach { it.close() }
        engineMap.clear()
    }
}
