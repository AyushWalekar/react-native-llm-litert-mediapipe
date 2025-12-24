package com.mediapipellm

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import com.google.ai.edge.litertlm.Backend
import com.google.ai.edge.litertlm.Content
import com.google.ai.edge.litertlm.Conversation
import com.google.ai.edge.litertlm.ConversationConfig
import com.google.ai.edge.litertlm.Engine
import com.google.ai.edge.litertlm.EngineConfig
import com.google.ai.edge.litertlm.Message
import com.google.ai.edge.litertlm.MessageCallback
import com.google.ai.edge.litertlm.SamplerConfig
import java.io.ByteArrayOutputStream
import java.io.File

/**
 * LLM Engine implementation using LiteRT-LM SDK.
 * Supports .litertlm model files with full multimodal (vision + audio) support.
 */
class LiteRtLmEngine(
    private val context: Context,
    private val config: LlmEngineConfig,
    private val inferenceListener: InferenceListener? = null
) : LlmEngine {
    
    private val engine: Engine
    private var conversation: Conversation
    
    // Pending multimodal content for next message
    private val pendingImages = mutableListOf<ByteArray>()
    private val pendingAudio = mutableListOf<ByteArray>()
    
    // For tracking current request
    private var requestResult: String = ""
    
    init {
        inferenceListener?.logging("Init LiteRtLmEngine: vision=${config.enableVisionModality}, audio=${config.enableAudioModality}")
        
        // Configure engine with backends (matching Gallery app defaults)
        val engineConfig = EngineConfig(
            modelPath = config.modelPath,
            backend = Backend.GPU,  // Main backend: GPU (fallback to CPU if unavailable)
            visionBackend = if (config.enableVisionModality) Backend.GPU else null,  // Vision: GPU for Gemma 3n
            audioBackend = if (config.enableAudioModality) Backend.CPU else null,    // Audio: CPU for Gemma 3n
            maxNumTokens = config.maxTokens,
            cacheDir = context.cacheDir.absolutePath
        )
        
        try {
            engine = Engine(engineConfig)
            engine.initialize()
            inferenceListener?.logging("LiteRT-LM engine initialized successfully")
        } catch (e: Exception) {
            inferenceListener?.logging("Error initializing LiteRT-LM engine: ${e.message}")
            throw e
        }
        
        // Create initial conversation with sampling config
        try {
            val conversationConfig = ConversationConfig(
                samplerConfig = SamplerConfig(
                    topK = config.topK,
                    topP = 0.95,  // Default topP
                    temperature = config.temperature.toDouble()
                )
            )
            conversation = engine.createConversation(conversationConfig)
            inferenceListener?.logging("LiteRT-LM conversation created successfully")
        } catch (e: Exception) {
            inferenceListener?.logging("Error creating conversation: ${e.message}")
            engine.close()
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
        
        // Convert bitmap to PNG bytes for LiteRT-LM
        val imageBytes = bitmap.toPngByteArray()
        pendingImages.add(imageBytes)
        inferenceListener?.logging("Image queued for next message (${imageBytes.size} bytes)")
    }
    
    override fun addAudio(audioPath: String) {
        val cleanPath = audioPath.removePrefix("file://")
        inferenceListener?.logging("Adding audio from path: $cleanPath")
        
        val file = File(cleanPath)
        if (!file.exists()) {
            throw IllegalArgumentException("Audio file does not exist: $cleanPath")
        }
        
        val audioData = file.readBytes()
        pendingAudio.add(audioData)
        inferenceListener?.logging("Audio queued for next message (${audioData.size} bytes)")
    }
    
    override fun generateResponse(requestId: Int, prompt: String): String {
        return try {
            val message = buildMessage(prompt)
            val response = conversation.sendMessage(message)
            
            // Clear pending media after sending
            clearPendingMedia()
            
            response.toString()
        } catch (e: Exception) {
            inferenceListener?.onError(requestId, e.message ?: "Unknown error")
            throw e
        }
    }
    
    override fun generateResponseAsync(requestId: Int, prompt: String, callback: (String) -> Unit) {
        requestResult = ""
        
        try {
            val message = buildMessage(prompt)
            
            // Clear pending media after building message
            clearPendingMedia()
            
            val messageCallback = object : MessageCallback {
                override fun onMessage(message: Message) {
                    val partialResult = message.toString()
                    requestResult += partialResult
                    inferenceListener?.onResults(requestId, partialResult)
                }
                
                override fun onDone() {
                    callback(requestResult)
                }
                
                override fun onError(throwable: Throwable) {
                    inferenceListener?.onError(requestId, throwable.message ?: "Unknown error")
                    callback("")
                }
            }
            
            conversation.sendMessageAsync(message, messageCallback)
        } catch (e: Exception) {
            inferenceListener?.onError(requestId, e.message ?: "Unknown error")
            callback("")
        }
    }
    
    override fun clearSession() {
        inferenceListener?.logging("Clearing LiteRT-LM session...")
        try {
            // Close current conversation
            conversation.close()
            
            // Create new conversation with same config
            val conversationConfig = ConversationConfig(
                samplerConfig = SamplerConfig(
                    topK = config.topK,
                    topP = 0.95,
                    temperature = config.temperature.toDouble()
                )
            )
            conversation = engine.createConversation(conversationConfig)
            
            // Clear any pending media
            clearPendingMedia()
            
            inferenceListener?.logging("LiteRT-LM session cleared successfully")
        } catch (e: Exception) {
            inferenceListener?.logging("Error clearing session: ${e.message}")
            throw e
        }
    }
    
    override fun close() {
        try {
            conversation.close()
        } catch (e: Exception) {
            inferenceListener?.logging("Error closing conversation: ${e.message}")
        }
        
        try {
            engine.close()
        } catch (e: Exception) {
            inferenceListener?.logging("Error closing engine: ${e.message}")
        }
        
        clearPendingMedia()
    }
    
    /**
     * Build a Message with all pending multimodal content and the text prompt.
     */
    private fun buildMessage(prompt: String): Message {
        val contents = mutableListOf<Content>()
        
        // Add images first
        for (imageBytes in pendingImages) {
            contents.add(Content.ImageBytes(imageBytes))
        }
        
        // Add audio
        for (audioBytes in pendingAudio) {
            contents.add(Content.AudioBytes(audioBytes))
        }
        
        // Add text prompt last (for accurate last token)
        if (prompt.trim().isNotEmpty()) {
            contents.add(Content.Text(prompt))
        }
        
        return Message.of(contents)
    }
    
    private fun clearPendingMedia() {
        pendingImages.clear()
        pendingAudio.clear()
    }
    
    private fun Bitmap.toPngByteArray(): ByteArray {
        val stream = ByteArrayOutputStream()
        compress(Bitmap.CompressFormat.PNG, 100, stream)
        return stream.toByteArray()
    }
}
