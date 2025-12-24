/**
 * LlmInferenceModelBare.swift
 * LLM inference model wrapper for bare React Native
 */

import Foundation
import MediaPipeTasksGenAI

enum LlmErrorBare: Error {
    case modelLoadError(String)
    case inferenceError(String)
    case sessionError(String)
}

class LlmInferenceModelBare {
    // The LlmInference instance and session
    private var inference: LlmInference
    private var session: LlmInference.Session?

    // Model configuration (exposed for session recreation)
    let modelPath: String
    let maxTokens: Int
    let topK: Int
    let temperature: Float
    let randomSeed: Int
    
    private let modelHandle: Int
    private let eventEmitter: (String, [String: Any]) -> Void
    private var currentResponse: String = ""

    init(
        modelPath: String, maxTokens: Int, topK: Int, temperature: Float, randomSeed: Int,
        eventEmitter: @escaping (String, [String: Any]) -> Void, modelHandle: Int
    ) throws {

        self.modelPath = modelPath
        self.maxTokens = maxTokens
        self.eventEmitter = eventEmitter
        self.modelHandle = modelHandle
        self.topK = topK
        self.temperature = temperature
        self.randomSeed = randomSeed

        // Log model loading
        self.eventEmitter(
            "logging",
            [
                "handle": modelHandle,
                "message": "Loading model from \(modelPath)",
            ])

        do {
            // Create options for model loading
            let options = LlmInference.Options(modelPath: modelPath)
            options.maxTokens = maxTokens
            options.maxTopk = topK

            // Create the LlmInference instance
            inference = try LlmInference(options: options)

            // Create a session immediately
            try createSession()

            // Log success
            self.eventEmitter(
                "logging",
                [
                    "handle": modelHandle,
                    "message": "Model loaded successfully",
                ])
        } catch {
            self.eventEmitter(
                "logging",
                [
                    "handle": modelHandle,
                    "message": "Failed to load model: \(error)",
                ])
            throw LlmErrorBare.modelLoadError("Failed to load model: \(error)")
        }
    }

    private func createSession() throws {
        // Based on the sample code, we create a session without additional options
        do {
            session = try LlmInference.Session(llmInference: inference)

            // Log success
            self.eventEmitter(
                "logging",
                [
                    "handle": modelHandle,
                    "message": "Session created successfully",
                ])
        } catch {
            throw LlmErrorBare.sessionError(
                "Failed to create LLM session: \(error.localizedDescription)")
        }
    }

    private func formatPrompt(text: String) -> String {
        // Format prompt similar to the sample code for best results
        let startTurn = "<start_of_turn>"
        let endTurn = "<end_of_turn>"
        let userPrefix = "user"
        let modelPrefix = "model"

        return "\(startTurn)\(userPrefix)\n\(text)\(endTurn)\(startTurn)\(modelPrefix)"
    }

    func generateResponse(
        requestId: Int, prompt: String, completion: @escaping (Result<String, Error>) -> Void
    ) throws {
        guard let session = session else {
            throw LlmErrorBare.sessionError("Session not initialized")
        }

        self.currentResponse = ""

        // Log generation start
        self.eventEmitter(
            "logging",
            [
                "handle": modelHandle,
                "requestId": requestId,
                "message": "Starting generation for prompt: \(String(prompt.prefix(30)))...",
            ])

        Task {
            do {
                let formattedPrompt = formatPrompt(text: prompt)
                try session.addQueryChunk(inputText: formattedPrompt)

                var fullResponse = ""
                let responseStream = session.generateResponseAsync()

                do {
                    for try await partialResult in responseStream {
                        // Emit partial response events
                        self.eventEmitter(
                            "onPartialResponse",
                            [
                                "handle": self.modelHandle,
                                "requestId": requestId,
                                "response": partialResult,
                            ])

                        // Accumulate response
                        fullResponse += partialResult
                    }

                    // Complete successfully
                    completion(.success(fullResponse))
                } catch {
                    self.eventEmitter(
                        "onErrorResponse",
                        [
                            "handle": self.modelHandle,
                            "requestId": requestId,
                            "error": error.localizedDescription,
                        ])

                    completion(.failure(LlmErrorBare.inferenceError(error.localizedDescription)))
                }
            } catch {
                self.eventEmitter(
                    "onErrorResponse",
                    [
                        "handle": self.modelHandle,
                        "requestId": requestId,
                        "error": error.localizedDescription,
                    ])

                completion(.failure(error))
            }
        }
    }

    func generateStreamingResponse(
        requestId: Int, prompt: String, completion: @escaping (Bool) -> Void
    ) throws {
        guard let session = session else {
            throw LlmErrorBare.sessionError("Session not initialized")
        }

        self.currentResponse = ""

        // Log generation start
        self.eventEmitter(
            "logging",
            [
                "handle": modelHandle,
                "requestId": requestId,
                "message":
                    "Starting streaming generation for prompt: \(String(prompt.prefix(30)))...",
            ])

        Task {
            do {
                let formattedPrompt = formatPrompt(text: prompt)
                try session.addQueryChunk(inputText: formattedPrompt)

                let responseStream = session.generateResponseAsync()

                do {
                    for try await partialResult in responseStream {
                        // Emit partial response events
                        self.eventEmitter(
                            "onPartialResponse",
                            [
                                "handle": self.modelHandle,
                                "requestId": requestId,
                                "response": partialResult,
                            ])
                    }

                    // Complete successfully
                    completion(true)
                } catch {
                    self.eventEmitter(
                        "onErrorResponse",
                        [
                            "handle": self.modelHandle,
                            "requestId": requestId,
                            "error": error.localizedDescription,
                        ])

                    completion(false)
                }
            } catch {
                self.eventEmitter(
                    "onErrorResponse",
                    [
                        "handle": self.modelHandle,
                        "requestId": requestId,
                        "error": error.localizedDescription,
                    ])

                completion(false)
            }
        }
    }
}
