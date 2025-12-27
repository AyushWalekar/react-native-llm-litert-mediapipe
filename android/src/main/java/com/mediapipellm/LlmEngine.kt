package com.mediapipellm

/**
 * Common interface for LLM inference engines.
 * Implemented by MediaPipeLlmEngine (for .task models) and LiteRtLmEngine (for .litertlm models).
 */
interface LlmEngine {
    /**
     * Add an image to the current session for multimodal inference.
     * @param imagePath Path to the image file (with or without file:// prefix)
     */
    fun addImage(imagePath: String)
    
    /**
     * Add audio to the current session for multimodal inference.
     * @param audioPath Path to the audio file (must be mono WAV for MediaPipe)
     */
    fun addAudio(audioPath: String)
    
    /**
     * Generate a response synchronously.
     * @param requestId Unique identifier for this request
     * @param prompt The text prompt to send to the model
     * @return The complete generated response
     */
    fun generateResponse(requestId: Int, prompt: String): String
    
    /**
     * Generate a response asynchronously with streaming.
     * @param requestId Unique identifier for this request
     * @param prompt The text prompt to send to the model
     * @param callback Called when generation is complete with the full response
     */
    fun generateResponseAsync(requestId: Int, prompt: String, callback: (String) -> Unit)

    /**
     * Cancel the current ongoing generation.
     */
    fun cancelGeneration()

    /**
     * Release all resources held by this engine.
     */
    fun close()
}

/**
 * Listener interface for inference events (streaming results, errors, logging).
 */
interface InferenceListener {
    fun logging(message: String)
    fun onError(requestId: Int, error: String)
    fun onResults(requestId: Int, response: String)
}

/**
 * Configuration for creating an LLM engine.
 */
data class LlmEngineConfig(
    val modelPath: String,
    val maxTokens: Int = 1024,
    val topK: Int = 40,
    val temperature: Float = 0.7f,
    val randomSeed: Int = 42,
    val enableVisionModality: Boolean = false,
    val enableAudioModality: Boolean = false,
    val maxNumImages: Int = 10
)
