package com.mediapipellm

import android.content.Context
import android.graphics.BitmapFactory
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.tasks.genai.llminference.GraphOptions
import com.google.mediapipe.tasks.genai.llminference.LlmInference
import com.google.mediapipe.tasks.genai.llminference.LlmInferenceSession
import com.google.mediapipe.tasks.genai.llminference.ProgressListener
import com.google.mediapipe.tasks.genai.llminference.AudioModelOptions

import java.io.File

class LlmInferenceModel(
    private var context: Context,
    private val modelPath: String,
    val maxTokens: Int,
    val topK: Int,
    val temperature: Float,
    val randomSeed: Int,
    val enableVisionModality: Boolean = false,
    val enableAudioModality: Boolean = false,
    val maxNumImages: Int = 10,
    val inferenceListener: InferenceListener? = null,
) {
    private var llmInference: LlmInference
    private var llmInferenceSession: LlmInferenceSession

    // For tracking current request
    private var requestId: Int = 0
    private var requestResult: String = ""
    
    init {
        inferenceListener?.logging(this, "Init LlmInferenceModel: vision=$enableVisionModality, audio=$enableAudioModality, maxImages=$maxNumImages")

        // Create the LLM engine with optional audio support
        val inferenceOptionsBuilder = LlmInference.LlmInferenceOptions.builder()
            .setModelPath(modelPath)
            .setMaxTokens(maxTokens)
            .setPreferredBackend(LlmInference.Backend.CPU)
        
        if (enableVisionModality) {
            inferenceOptionsBuilder.setMaxNumImages(maxNumImages)
        }
        if (enableAudioModality) {
            // Configure audio model options if audio modality is enabled
            val audioModelOptions = AudioModelOptions.builder()
                // .setSampleRate(16000) // Set sample rate if needed
                .build()
            inferenceOptionsBuilder.setAudioModelOptions(audioModelOptions)
        }

        val inferenceOptions = inferenceOptionsBuilder.build()

        try {
            llmInference = LlmInference.createFromOptions(context, inferenceOptions)
            inferenceListener?.logging(this, "LLM inference engine created successfully")
        } catch (e: Exception) {
            inferenceListener?.logging(this, "Error creating LLM inference engine: ${e.message}")
            throw e
        }

        // Create a session with GraphOptions for multimodal support
        val sessionOptionsBuilder = LlmInferenceSession.LlmInferenceSessionOptions.builder()
            .setTemperature(temperature)
            .setTopK(topK)
        
        // Add GraphOptions if vision or audio modality is enabled
        if (enableVisionModality || enableAudioModality) {
            val graphOptions = GraphOptions.builder()
                .setEnableVisionModality(enableVisionModality)
                .setEnableAudioModality(enableAudioModality)
                .build()
            sessionOptionsBuilder.setGraphOptions(graphOptions)
            inferenceListener?.logging(this, "GraphOptions configured: vision=$enableVisionModality")
        }
        
        val sessionOptions = sessionOptionsBuilder.build()

        try {
            llmInferenceSession = LlmInferenceSession.createFromOptions(llmInference, sessionOptions)
            inferenceListener?.logging(this, "LLM inference session created successfully")
        } catch (e: Exception) {
            inferenceListener?.logging(this, "Error creating LLM inference session: ${e.message}")
            llmInference.close()
            throw e
        }
    }

    /**
     * Add image from file path to the current session
     */
    fun addImage(imagePath: String) {
        val cleanPath = imagePath.removePrefix("file://")
        inferenceListener?.logging(this, "Adding image from path: $cleanPath")
        
        val file = File(cleanPath)
        if (!file.exists()) {
            throw IllegalArgumentException("Image file does not exist: $cleanPath")
        }
        
        val bitmap = BitmapFactory.decodeFile(file.absolutePath)
        if (bitmap == null) {
             throw IllegalArgumentException("Could not decode image at: $cleanPath")
        }
        
        inferenceListener?.logging(this, "Bitmap decoded: ${bitmap.width}x${bitmap.height}")

        try {
            val mpImage = BitmapImageBuilder(bitmap).build()
            llmInferenceSession.addImage(mpImage)
            inferenceListener?.logging(this, "Image added to session successfully")
        } catch (e: Exception) {
            inferenceListener?.logging(this, "Failed to add image to session: ${e.message}")
            throw e
        }
    }

    /**
     * Add audio from file path to the current session (must be mono channel WAV)
     */
    fun addAudio(audioPath: String) {
        val cleanPath = audioPath.removePrefix("file://")
        val file = File(cleanPath)
        if (!file.exists()) {
            throw IllegalArgumentException("Audio file does not exist: $cleanPath")
        }
        
        val audioData = file.readBytes()
        llmInferenceSession.addAudio(audioData)
        inferenceListener?.logging(this, "Added audio to session: $audioPath (${audioData.size} bytes)")
    }

    /**
     * Generates text asynchronously with streaming results via callback
     */
    fun generateResponseAsync(requestId: Int, prompt: String, callback: (String) -> Unit) {
        this.requestId = requestId
        this.requestResult = ""
        
        try {
            // Use existing session to preserve context (images/audio)
            
            // Add the prompt to the session
            llmInferenceSession.addQueryChunk(prompt)
            
            // Define the progress listener for streaming results
            val progressListener = ProgressListener<String> { result, isFinished ->
                // Send each partial result immediately through the listener
                inferenceListener?.onResults(this, requestId, result)
                
                // Only append to cumulative result and call callback on completion
                requestResult += result
                
                if (isFinished) {
                    callback(requestResult)
                }
            }
            
            // Generate the response asynchronously
            llmInferenceSession.generateResponseAsync(progressListener)
        } catch (e: Exception) {
            inferenceListener?.onError(this, requestId, e.message ?: "")
            callback("")
        }
    }
    
    /**
     * Generates text synchronously and returns the complete response
     */
    fun generateResponse(requestId: Int, prompt: String): String {
        this.requestId = requestId
        this.requestResult = ""
        
        return try {
            // Use existing session to preserve context
            
            // Add the prompt to the session
            llmInferenceSession.addQueryChunk(prompt)
            
            val stringBuilder = StringBuilder()

            // Generate the response synchronously
            val result = llmInferenceSession.generateResponse()
            stringBuilder.append(result)
            
            stringBuilder.toString()
        } catch (e: Exception) {
            inferenceListener?.onError(this, requestId, e.message ?: "")
            throw e
        }
    }
    
    /**
     * Close resources when no longer needed
     */
    fun close() {
        try {
            llmInferenceSession.close()
            llmInference.close()
        } catch (e: Exception) {
            // Ignore close errors
            inferenceListener?.logging(this, "Error closing resources: ${e.message}")
        }
    }
}

interface InferenceListener {
    fun logging(model: LlmInferenceModel, message: String)
    fun onError(model: LlmInferenceModel, requestId: Int, error: String)
    fun onResults(model: LlmInferenceModel, requestId: Int, response: String)
}
