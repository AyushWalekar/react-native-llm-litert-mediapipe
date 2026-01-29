/**
 * Message conversion utilities for AI SDK V3
 *
 * Converts AI SDK LanguageModelV3 prompt format to the library's ModelMessage format
 */

import type {
  LanguageModelV3Prompt,
  LanguageModelV3Message,
  LanguageModelV3TextPart,
  LanguageModelV3FilePart,
} from "@ai-sdk/provider";

import type {
  ModelMessage,
  ContentPart,
  TextPart,
  ImagePart,
  FilePart,
} from "../LlmApi.types";

/**
 * Convert AI SDK V3 prompt to library's ModelMessage array
 */
export function convertPromptToMessages(
  prompt: LanguageModelV3Prompt,
): ModelMessage[] {
  const messages: ModelMessage[] = [];

  for (const message of prompt) {
    const converted = convertMessage(message);
    if (converted) {
      messages.push(converted);
    }
  }

  return messages;
}

/**
 * Convert a single AI SDK message to library format
 */
function convertMessage(message: LanguageModelV3Message): ModelMessage | null {
  switch (message.role) {
    case "system":
      return {
        role: "system",
        content: message.content,
      };

    case "user":
      return {
        role: "user",
        content: convertUserContent(message.content),
      };

    case "assistant":
      return {
        role: "assistant",
        content: convertAssistantContent(message.content),
      };

    case "tool":
      // Tool messages are not supported in initial release
      console.warn(
        "[MediaPipeLlm] Tool messages are not supported in this version",
      );
      return null;

    default:
      return null;
  }
}

/**
 * Convert AI SDK user content to library format
 */
function convertUserContent(
  content: LanguageModelV3Message["content"],
): string | ContentPart[] {
  if (typeof content === "string") {
    return content;
  }

  // Content is an array of parts
  const parts: ContentPart[] = [];

  for (const part of content as Array<
    LanguageModelV3TextPart | LanguageModelV3FilePart
  >) {
    const converted = convertContentPart(part);
    if (converted) {
      parts.push(converted);
    }
  }

  // If only one text part, return as string for simplicity
  if (parts.length === 1 && parts[0].type === "text") {
    return (parts[0] as TextPart).text;
  }

  return parts;
}

/**
 * Convert AI SDK assistant content to library format
 */
function convertAssistantContent(
  content: LanguageModelV3Message["content"],
): string | TextPart[] {
  if (typeof content === "string") {
    return content;
  }

  // Extract only text parts from assistant content
  const textParts: TextPart[] = [];

  for (const part of content as Array<unknown>) {
    if (isTextPart(part)) {
      textParts.push({
        type: "text",
        text: part.text,
      });
    }
  }

  if (textParts.length === 1) {
    return textParts[0].text;
  }

  return textParts;
}

/**
 * Convert a content part from AI SDK format to library format
 */
function convertContentPart(
  part: LanguageModelV3TextPart | LanguageModelV3FilePart | unknown,
): ContentPart | null {
  if (isTextPart(part)) {
    return {
      type: "text",
      text: part.text,
    } as TextPart;
  }

  if (isFilePart(part)) {
    return convertFilePart(part);
  }

  // Handle image parts (AI SDK uses file parts with image/* media types)
  if (isImagePart(part)) {
    return convertImagePart(part);
  }

  return null;
}

/**
 * Convert AI SDK file part to library format
 */
function convertFilePart(part: LanguageModelV3FilePart): FilePart | ImagePart {
  const mediaType = part.mediaType || "application/octet-stream";

  // Check if it's an image type
  if (mediaType.startsWith("image/")) {
    return {
      type: "image",
      image: extractDataFromPart(part),
      mediaType,
    } as ImagePart;
  }

  return {
    type: "file",
    data: extractDataFromPart(part),
    mediaType,
    filename: (part as { filename?: string }).filename,
  } as FilePart;
}

/**
 * Convert image-specific parts
 * Handles local file paths - the native layer expects raw file paths, not URLs
 */
function convertImagePart(part: unknown): ImagePart {
  const imagePart = part as {
    type: "image";
    image: string | Uint8Array | ArrayBuffer | URL;
    mediaType?: string;
  };

  // Extract the actual file path from the image data
  const imageData = extractLocalPath(imagePart.image);

  return {
    type: "image",
    image: imageData,
    mediaType: imagePart.mediaType,
  };
}

/**
 * Extract local file path from various input formats
 * The native LLM expects raw file paths, not URLs
 */
function extractLocalPath(
  data: string | Uint8Array | ArrayBuffer | URL,
): string | Uint8Array | ArrayBuffer {
  if (typeof data === "string") {
    // Remove file:// prefix if present - native layer needs raw path
    if (data.startsWith("file://")) {
      return data.replace("file://", "");
    }
    // Remove content:// handling - pass through as-is for Android content URIs
    return data;
  }

  if (data instanceof URL) {
    const urlString = data.toString();
    // Remove file:// prefix for local files
    if (urlString.startsWith("file://")) {
      return urlString.replace("file://", "");
    }
    return urlString;
  }

  // Binary data passes through unchanged
  if (data instanceof Uint8Array || data instanceof ArrayBuffer) {
    return data;
  }

  return String(data);
}

/**
 * Extract data from AI SDK file part
 * Handles local file paths - the native layer expects raw file paths, not URLs
 */
function extractDataFromPart(
  part: LanguageModelV3FilePart,
): string | Uint8Array | ArrayBuffer {
  return extractLocalPath(part.data);
}

// Type guards

function isTextPart(part: unknown): part is LanguageModelV3TextPart {
  return (
    typeof part === "object" &&
    part !== null &&
    (part as { type?: string }).type === "text" &&
    typeof (part as { text?: unknown }).text === "string"
  );
}

function isFilePart(part: unknown): part is LanguageModelV3FilePart {
  return (
    typeof part === "object" &&
    part !== null &&
    (part as { type?: string }).type === "file"
  );
}

function isImagePart(
  part: unknown,
): part is { type: "image"; image: unknown; mediaType?: string } {
  return (
    typeof part === "object" &&
    part !== null &&
    (part as { type?: string }).type === "image"
  );
}

/**
 * Extract text content from messages for prompt building
 */
export function extractTextFromMessages(messages: ModelMessage[]): string {
  let text = "";

  for (const message of messages) {
    if (message.role === "system" || message.role === "assistant") {
      if (typeof message.content === "string") {
        text += message.content + "\n";
      }
    } else if (message.role === "user") {
      if (typeof message.content === "string") {
        text += message.content + "\n";
      } else if (Array.isArray(message.content)) {
        for (const part of message.content) {
          if (part.type === "text") {
            text += part.text + "\n";
          }
        }
      }
    }
  }

  return text.trim();
}
