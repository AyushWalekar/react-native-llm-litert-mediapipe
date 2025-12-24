/**
 * Chat Formatter Utility
 *
 * Converts OpenAI-compatible chat messages to prompts and extracts multimodal content.
 * Provides a unified interface similar to llama.rn for MediaPipe/LiteRT-LM models.
 */

import type {
  ChatMessage,
  MessageContent,
  TextContentPart,
  ImageContentPart,
  AudioContentPart,
  CompletionOptions,
} from "../MediaPipeLlm.types";

/**
 * Extracted multimodal content from messages
 */
export interface ExtractedMedia {
  /** Image file paths to add to session before generating */
  images: string[];
  /** Audio file paths to add to session before generating */
  audio: string[];
}

/**
 * Result of formatting chat messages
 */
export interface FormattedChat {
  /** The formatted prompt string to send to the model */
  prompt: string;
  /** Extracted multimodal content (images, audio) */
  media: ExtractedMedia;
  /** System prompt if present */
  systemPrompt: string | null;
}

/**
 * Default chat template for Gemma models
 * Can be customized for different model families
 */
export interface ChatTemplate {
  /** Template for system messages */
  system: (content: string) => string;
  /** Template for user messages */
  user: (content: string) => string;
  /** Template for assistant messages */
  assistant: (content: string) => string;
  /** Separator between messages */
  separator: string;
  /** Token/text that signals model should generate response */
  generationPrompt: string;
}

/**
 * Default Gemma-style chat template
 */
export const GEMMA_TEMPLATE: ChatTemplate = {
  system: (content) => `<start_of_turn>user\nSystem: ${content}<end_of_turn>\n`,
  user: (content) => `<start_of_turn>user\n${content}<end_of_turn>\n`,
  assistant: (content) => `<start_of_turn>model\n${content}<end_of_turn>\n`,
  separator: "",
  generationPrompt: "<start_of_turn>model\n",
};

/**
 * Simple chat template (for basic instruction-tuned models)
 */
export const SIMPLE_TEMPLATE: ChatTemplate = {
  system: (content) => `System: ${content}\n\n`,
  user: (content) => `User: ${content}\n`,
  assistant: (content) => `Assistant: ${content}\n`,
  separator: "",
  generationPrompt: "Assistant: ",
};

/**
 * ChatML template (used by some models)
 */
export const CHATML_TEMPLATE: ChatTemplate = {
  system: (content) => `<|im_start|>system\n${content}<|im_end|>\n`,
  user: (content) => `<|im_start|>user\n${content}<|im_end|>\n`,
  assistant: (content) => `<|im_start|>assistant\n${content}<|im_end|>\n`,
  separator: "",
  generationPrompt: "<|im_start|>assistant\n",
};

/**
 * Extract text content from a message
 */
function extractTextContent(content: MessageContent): string {
  if (typeof content === "string") {
    return content;
  }

  // Extract text parts from content array
  const textParts = content
    .filter((part): part is TextContentPart => part.type === "text")
    .map((part) => part.text);

  return textParts.join("\n");
}

/**
 * Extract image URLs/paths from a message
 */
function extractImages(content: MessageContent): string[] {
  if (typeof content === "string") {
    return [];
  }

  return content
    .filter((part): part is ImageContentPart => part.type === "image_url")
    .map((part) => part.image_url.url);
}

/**
 * Extract audio URLs/paths from a message
 */
function extractAudio(content: MessageContent): string[] {
  if (typeof content === "string") {
    return [];
  }

  return content
    .filter((part): part is AudioContentPart => part.type === "input_audio")
    .map((part) => {
      // Prefer URL over data
      if (part.input_audio.url) {
        return part.input_audio.url;
      }
      // If only data is provided, it should be a data URL or base64
      if (part.input_audio.data) {
        const format = part.input_audio.format || "wav";
        return `data:audio/${format};base64,${part.input_audio.data}`;
      }
      return "";
    })
    .filter((url) => url.length > 0);
}

/**
 * Format chat messages into a prompt string and extract multimodal content
 *
 * @param options - Completion options containing messages
 * @param template - Chat template to use (defaults to Gemma template)
 * @returns Formatted chat with prompt and extracted media
 *
 * @example
 * ```typescript
 * const { prompt, media } = formatChatMessages({
 *   messages: [
 *     { role: 'system', content: 'You are helpful.' },
 *     { role: 'user', content: [
 *       { type: 'text', text: 'What is in this image?' },
 *       { type: 'image_url', image_url: { url: 'file:///path/to/img.jpg' } }
 *     ]}
 *   ]
 * });
 *
 * // Add images to session first
 * for (const imagePath of media.images) {
 *   await addImage(imagePath);
 * }
 *
 * // Then generate with the text prompt
 * const response = await generate(prompt);
 * ```
 */
export function formatChatMessages(
  options: CompletionOptions,
  template: ChatTemplate = GEMMA_TEMPLATE
): FormattedChat {
  const { messages } = options;
  const media: ExtractedMedia = { images: [], audio: [] };
  let systemPrompt: string | null = null;
  const formattedParts: string[] = [];

  for (const message of messages) {
    // Extract text content
    const textContent = extractTextContent(message.content);

    // Extract multimodal content
    const images = extractImages(message.content);
    const audio = extractAudio(message.content);
    media.images.push(...images);
    media.audio.push(...audio);

    // Format based on role
    switch (message.role) {
      case "system":
        systemPrompt = textContent;
        formattedParts.push(template.system(textContent));
        break;
      case "user":
        formattedParts.push(template.user(textContent));
        break;
      case "assistant":
        formattedParts.push(template.assistant(textContent));
        break;
    }
  }

  // Add generation prompt at the end
  formattedParts.push(template.generationPrompt);

  const prompt = formattedParts.join(template.separator);

  return {
    prompt,
    media,
    systemPrompt,
  };
}

/**
 * Detect the appropriate template based on model name
 */
export function detectTemplate(modelName: string): ChatTemplate {
  const lowerName = modelName.toLowerCase();

  if (lowerName.includes("gemma")) {
    return GEMMA_TEMPLATE;
  }

  if (lowerName.includes("chatml") || lowerName.includes("qwen")) {
    return CHATML_TEMPLATE;
  }

  // Default to simple template
  return SIMPLE_TEMPLATE;
}

/**
 * Check if a message contains multimodal content
 */
export function hasMultimodalContent(messages: ChatMessage[]): boolean {
  return messages.some((message) => {
    if (typeof message.content === "string") {
      return false;
    }
    return message.content.some(
      (part) => part.type === "image_url" || part.type === "input_audio"
    );
  });
}

/**
 * Validate that multimodal content paths are accessible
 * Returns array of invalid paths
 */
export function validateMediaPaths(media: ExtractedMedia): string[] {
  const invalidPaths: string[] = [];

  // Check images
  for (const imagePath of media.images) {
    // Data URLs are always valid
    if (imagePath.startsWith("data:")) continue;
    // HTTP URLs are not yet supported
    if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
      invalidPaths.push(imagePath);
    }
  }

  // Check audio
  for (const audioPath of media.audio) {
    if (audioPath.startsWith("data:")) continue;
    if (audioPath.startsWith("http://") || audioPath.startsWith("https://")) {
      invalidPaths.push(audioPath);
    }
  }

  return invalidPaths;
}
