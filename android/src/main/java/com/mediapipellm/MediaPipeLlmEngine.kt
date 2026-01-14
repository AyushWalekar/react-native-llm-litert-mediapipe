package com.mediapipellm

import android.content.Context
import android.graphics.BitmapFactory
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.tasks.genai.llminference.AudioModelOptions
import com.google.mediapipe.tasks.genai.llminference.GraphOptions
import com.google.mediapipe.tasks.genai.llminference.LlmInference
import com.google.mediapipe.tasks.genai.llminference.LlmInferenceSession
import com.google.mediapipe.tasks.genai.llminference.ProgressListener
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import java.io.File

/**
 * LLM Engine implementation using MediaPipe tasks-genai SDK.
 * Supports .task model files with multimodal (vision) support.
 * Note: Audio support via MediaPipe requires AudioEncoder in the model.
 */
class MediaPipeLlmEngine(
    private val context: Context,
    private val config: LlmEngineConfig,
    private val inferenceListener: InferenceListener? = null
) : LlmEngine {

    private val llmInference: LlmInference
    private val llmInferenceSession: LlmInferenceSession

    // Coroutine scope for async operations
    private val coroutineScope = CoroutineScope(Dispatchers.Main)
    private val supervisorJob = SupervisorJob()

    // For tracking current request
    private var requestResult: String = ""

    // Job reference for cancellation
    private var currentJob: Job? = null

    init {
        inferenceListener?.logging("Init MediaPipeLlmEngine: vision=${config.enableVisionModality}, audio=${config.enableAudioModality}, maxImages=${config.maxNumImages}")

        // Create the LLM engine with optional audio support
        val inferenceOptionsBuilder = LlmInference.LlmInferenceOptions.builder()
            .setModelPath(config.modelPath)
            .setMaxTokens(config.maxTokens)
            .setPreferredBackend(LlmInference.Backend.CPU)

        if (config.enableVisionModality) {
            inferenceOptionsBuilder.setMaxNumImages(config.maxNumImages)
        }
        if (config.enableAudioModality) {
            // Configure audio model options if audio modality is enabled
            val audioModelOptions = AudioModelOptions.builder().build()
            inferenceOptionsBuilder.setAudioModelOptions(audioModelOptions)
        }

        val inferenceOptions = inferenceOptionsBuilder.build()

        try {
            llmInference = LlmInference.createFromOptions(context, inferenceOptions)
            inferenceListener?.logging("MediaPipe LLM inference engine created successfully")
        } catch (e: Exception) {
            inferenceListener?.logging("Error creating MediaPipe LLM inference engine: ${e.message}")
            throw e
        }

        // Create a session with GraphOptions for multimodal support
        val sessionOptionsBuilder = LlmInferenceSession.LlmInferenceSessionOptions.builder()
            .setTemperature(config.temperature)
            .setTopK(config.topK)

        // Add GraphOptions if vision or audio modality is enabled
        if (config.enableVisionModality || config.enableAudioModality) {
            val graphOptions = GraphOptions.builder()
                .setEnableVisionModality(config.enableVisionModality)
                .setEnableAudioModality(config.enableAudioModality)
                .build()
            sessionOptionsBuilder.setGraphOptions(graphOptions)
            inferenceListener?.logging("GraphOptions configured: vision=${config.enableVisionModality}, audio=${config.enableAudioModality}")
        }

        val sessionOptions = sessionOptionsBuilder.build()

        try {
            llmInferenceSession = LlmInferenceSession.createFromOptions(llmInference, sessionOptions)
            inferenceListener?.logging("MediaPipe LLM inference session created successfully")
        } catch (e: Exception) {
            inferenceListener?.logging("Error creating MediaPipe LLM inference session: ${e.message}")
            llmInference.close()
            throw e
        }
    }

    override fun addImage(imagePath: String) {
        val cleanPath = imagePath.removePrefix("file://")
        inferenceListener?.logging("Adding image from path: $cleanPath")

        val file = File(cleanPath)
        if (!file.exists()) {
            throw IllegalArgumentException("Image file does not exist: $cleanPath")
        }

        val bitmap = BitmapFactory.decodeFile(file.absolutePath)
            ?: throw IllegalArgumentException("Could not decode image at: $cleanPath")

        inferenceListener?.logging("Bitmap decoded: ${bitmap.width}x${bitmap.height}")

        try {
            val mpImage = BitmapImageBuilder(bitmap).build()
            llmInferenceSession.addImage(mpImage)
            inferenceListener?.logging("Image added to session successfully")
        } catch (e: Exception) {
            inferenceListener?.logging("Failed to add image to session: ${e.message}")
            throw e
        }
    }

    override fun addAudio(audioPath: String) {
        val cleanPath = audioPath.removePrefix("file://")
        inferenceListener?.logging("Adding audio from path: $cleanPath")

        val file = File(cleanPath)
        if (!file.exists()) {
            throw IllegalArgumentException("Audio file does not exist: $cleanPath")
        }

        val audioData = file.readBytes()
        llmInferenceSession.addAudio(audioData)
        inferenceListener?.logging("Added audio to session: $audioPath (${audioData.size} bytes)")
    }

    override fun generateResponse(requestId: Int, prompt: String): String {
        return try {
            // Add the prompt to the session
            llmInferenceSession.addQueryChunk(prompt)

            // Generate the response synchronously
            val result = llmInferenceSession.generateResponse()
            result
        } catch (e: Exception) {
            inferenceListener?.onError(requestId, e.message ?: "Unknown error")
            throw e
        }
    }

    override fun generateResponseAsync(requestId: Int, prompt: String, callback: (String) -> Unit) {
        currentJob = coroutineScope.launch {
            try {
                // Add the prompt to the session
                llmInferenceSession.addQueryChunk(prompt)

                // Define the progress listener for streaming results
                val progressListener = ProgressListener<String> { result, isFinished ->
                    // Send each partial result immediately through the listener
                    inferenceListener?.onResults(requestId, result)

                    // Append to cumulative result
                    requestResult += result

                    if (isFinished) {
                        callback(requestResult)
                    }
                }

                // Generate the response asynchronously
                llmInferenceSession.generateResponseAsync(progressListener)
            } catch (e: Exception) {
                if (!isActive) {
                    inferenceListener?.logging("Generation was cancelled")
                } else {
                    inferenceListener?.onError(requestId, e.message ?: "Unknown error")
                    callback("")
                }
            }
        }
    }

    override fun cancelGeneration() {
        currentJob?.cancel()
        currentJob = null
        inferenceListener?.logging("Generation cancelled")
    }

    override fun close() {
        cancelGeneration()
        supervisorJob.cancel()
        try {
            llmInferenceSession.close()
            llmInference.close()
        } catch (e: Exception) {
            inferenceListener?.logging("Error closing resources: ${e.message}")
        }
    }

    /**
     * Structured output is not supported by MediaPipe tasks-genai.
     * This feature requires LiteRT-LM models (.litertlm files).
     */
    override fun generateStructuredOutput(requestId: Int, prompt: String, outputSchema: String): String {
        throw UnsupportedOperationException(
            "Structured output is only supported with LiteRT-LM models (.litertlm files). " +
            "MediaPipe .task models do not support tool calling required for structured output."
        )
    }
}
