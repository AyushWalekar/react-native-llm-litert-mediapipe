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
import com.google.ai.edge.litertlm.Tool
import com.google.ai.edge.litertlm.ToolParam
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.json.JSONObject
import org.json.JSONArray
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

    // Coroutine scope for async operations
    private val coroutineScope = CoroutineScope(Dispatchers.Main)

    // Pending multimodal content for next message
    private val pendingImages = mutableListOf<ByteArray>()
    private val pendingAudio = mutableListOf<ByteArray>()

    // For tracking current request
    private var requestResult: String = ""

    // Job reference for cancellation
    private var currentJob: Job? = null
    
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
        currentJob = coroutineScope.launch {
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
                        if (!isActive) {
                            inferenceListener?.logging("Generation was cancelled")
                        } else {
                            inferenceListener?.onError(requestId, throwable.message ?: "Unknown error")
                        }
                        callback("")
                    }
                }

                conversation.sendMessageAsync(message, messageCallback)
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
        conversation.cancelProcess()
        inferenceListener?.logging("Generation cancelled via cancelProcess()")
    }

    override fun close() {
        currentJob?.cancel()
        currentJob = null
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

    /**
     * Generate structured output using tool calling.
     * Creates a conversation with a tool that has parameters matching the output schema.
     * The model is instructed to call this tool with data matching the schema.
     *
     * @param requestId Unique identifier for this request
     * @param prompt The text prompt to send to the model
     * @param outputSchema JSON Schema string defining the expected output structure
     * @return JSON string containing the structured output matching the schema
     */
    override fun generateStructuredOutput(requestId: Int, prompt: String, outputSchema: String): String {
        inferenceListener?.logging("generateStructuredOutput: Starting with schema length=${outputSchema.length}")

        try {
            // Parse the output schema to understand its structure
            val schemaJson = JSONObject(outputSchema)
            inferenceListener?.logging("generateStructuredOutput: Parsed schema successfully")

            // Create a system message that instructs the model to output structured data
            val systemPrompt = buildStructuredOutputSystemPrompt(schemaJson)
            inferenceListener?.logging("generateStructuredOutput: Built system prompt")

            // Create the tool for structured output
            val structuredOutputTool = StructuredOutputTool(schemaJson, inferenceListener)

            // Create a new conversation with the tool registered
            val toolConversationConfig = ConversationConfig(
                systemMessage = Message.of(listOf(Content.Text(systemPrompt))),
                tools = listOf(structuredOutputTool),
                samplerConfig = SamplerConfig(
                    topK = config.topK,
                    topP = 0.95,
                    temperature = config.temperature.toDouble()
                )
            )

            inferenceListener?.logging("generateStructuredOutput: Creating conversation with tool")
            val toolConversation = engine.createConversation(toolConversationConfig)

            try {
                // Send the user's prompt
                val userMessage = Message.of(listOf(Content.Text(prompt)))
                inferenceListener?.logging("generateStructuredOutput: Sending message to model")

                val response = toolConversation.sendMessage(userMessage)
                val responseText = response.toString()
                inferenceListener?.logging("generateStructuredOutput: Received response length=${responseText.length}")

                // Extract structured output from the response
                val structuredOutput = extractStructuredOutput(responseText, schemaJson)
                inferenceListener?.logging("generateStructuredOutput: Extracted structured output")

                return structuredOutput
            } finally {
                // Always close the tool conversation
                try {
                    toolConversation.close()
                    inferenceListener?.logging("generateStructuredOutput: Closed tool conversation")
                } catch (e: Exception) {
                    inferenceListener?.logging("generateStructuredOutput: Error closing conversation: ${e.message}")
                }
            }
        } catch (e: Exception) {
            inferenceListener?.logging("generateStructuredOutput: Error - ${e.message}")
            inferenceListener?.onError(requestId, e.message ?: "Structured output generation failed")
            throw e
        }
    }

    /**
     * Build a system prompt that instructs the model to output structured JSON.
     */
    private fun buildStructuredOutputSystemPrompt(schema: JSONObject): String {
        val schemaString = schema.toString(2)
        return """
You are an AI assistant that MUST respond using the structured_output function.
You MUST call the structured_output function with a JSON string that matches this JSON Schema:

$schemaString

IMPORTANT RULES:
1. You MUST call the structured_output function - do NOT respond with plain text
2. The json_data parameter must be a valid JSON string
3. The JSON must match the schema exactly with all required fields
4. Use the correct data types as specified in the schema
5. If the schema has enum values, use only those values
6. Example function call: structured_output(json_data='{"key": "value"}')

Analyze the user's request and provide your response by calling the structured_output function with the appropriate JSON string.
        """.trimIndent()
    }

    /**
     * Extract structured output from the model's response.
     * The response may contain a tool call or plain JSON.
     */
    private fun extractStructuredOutput(responseText: String, schema: JSONObject): String {
        inferenceListener?.logging("extractStructuredOutput: Processing response")

        // Try to parse as JSON directly first
        try {
            // Check if response contains tool call format
            if (responseText.contains("structured_output") || responseText.contains("function_call")) {
                // Try to extract arguments from tool call
                val extracted = extractToolCallArguments(responseText)
                if (extracted != null) {
                    inferenceListener?.logging("extractStructuredOutput: Extracted from tool call")
                    return extracted
                }
            }

            // Try to parse the response as direct JSON
            val jsonStart = responseText.indexOf('{')
            val jsonEnd = responseText.lastIndexOf('}')

            if (jsonStart >= 0 && jsonEnd > jsonStart) {
                val jsonStr = responseText.substring(jsonStart, jsonEnd + 1)
                // Validate it's valid JSON
                val parsed = JSONObject(jsonStr)
                inferenceListener?.logging("extractStructuredOutput: Extracted JSON object from response")
                return parsed.toString()
            }

            // Try to find JSON array
            val arrayStart = responseText.indexOf('[')
            val arrayEnd = responseText.lastIndexOf(']')

            if (arrayStart >= 0 && arrayEnd > arrayStart) {
                val jsonStr = responseText.substring(arrayStart, arrayEnd + 1)
                val parsed = JSONArray(jsonStr)
                inferenceListener?.logging("extractStructuredOutput: Extracted JSON array from response")
                return parsed.toString()
            }

        } catch (e: Exception) {
            inferenceListener?.logging("extractStructuredOutput: Parse error - ${e.message}")
        }

        // If all else fails, return the raw response wrapped in a result object
        inferenceListener?.logging("extractStructuredOutput: Returning raw response as fallback")
        return JSONObject().apply {
            put("raw_response", responseText)
            put("parse_error", "Could not extract structured JSON from response")
        }.toString()
    }

    /**
     * Extract arguments from a tool call response.
     */
    private fun extractToolCallArguments(responseText: String): String? {
        try {
            // Try parsing as JSON with tool call structure
            val json = JSONObject(responseText)

            // Check for "arguments" field (common tool call format)
            if (json.has("arguments")) {
                val args = json.get("arguments")
                // If arguments is an object, check for json_data field
                if (args is JSONObject) {
                    if (args.has("json_data")) {
                        val jsonData = args.getString("json_data")
                        // Parse the json_data string to validate and return
                        return try {
                            JSONObject(jsonData).toString()
                        } catch (e: Exception) {
                            // If it's an array
                            try {
                                JSONArray(jsonData).toString()
                            } catch (e2: Exception) {
                                jsonData // Return as-is if not valid JSON
                            }
                        }
                    }
                    return args.toString()
                }
                return args.toString()
            }

            // Check for "function_call" wrapper
            if (json.has("function_call")) {
                val functionCall = json.getJSONObject("function_call")
                if (functionCall.has("arguments")) {
                    val args = functionCall.get("arguments")
                    if (args is JSONObject && args.has("json_data")) {
                        val jsonData = args.getString("json_data")
                        return try {
                            JSONObject(jsonData).toString()
                        } catch (e: Exception) {
                            jsonData
                        }
                    }
                    return if (args is JSONObject) args.toString() else args.toString()
                }
            }

            // Check for direct json_data field
            if (json.has("json_data")) {
                val jsonData = json.getString("json_data")
                return try {
                    JSONObject(jsonData).toString()
                } catch (e: Exception) {
                    jsonData
                }
            }

            // Check for nested structure with "data" or "output"
            if (json.has("data")) {
                val data = json.get("data")
                return if (data is JSONObject) data.toString() else data.toString()
            }
            if (json.has("output")) {
                val output = json.get("output")
                return if (output is JSONObject) output.toString() else output.toString()
            }

        } catch (e: Exception) {
            // Not a valid JSON tool call, continue to other extraction methods
            inferenceListener?.logging("extractToolCallArguments: Parse exception - ${e.message}")
        }

        return null
    }
}

/**
 * Tool class for structured output generation.
 * Uses LiteRT-LM's tool calling system to capture structured responses.
 *
 * Note: LiteRT-LM only supports primitive types (String, Int, Boolean, Float, Double, List)
 * so we use a String parameter to receive JSON data.
 */
class StructuredOutputTool(
    private val schema: JSONObject,
    private val listener: InferenceListener? = null
) {
    // Store the last received JSON data for retrieval
    private var lastJsonData: String? = null

    /**
     * The tool method that the model will call.
     * The model should call this with a JSON string matching the schema.
     */
    @Tool(description = "Output structured data as a JSON string matching the required schema. You MUST call this function with your response data as a valid JSON string.")
    fun structured_output(
        @ToolParam(description = "The structured data as a valid JSON string matching the required schema")
        json_data: String
    ): String {
        listener?.logging("StructuredOutputTool: Received JSON data: ${json_data.take(100)}...")
        lastJsonData = json_data
        // Return success confirmation
        return """{"success": true, "received": true}"""
    }

    /**
     * Get the last JSON data received by this tool.
     */
    fun getLastJsonData(): String? = lastJsonData
}
