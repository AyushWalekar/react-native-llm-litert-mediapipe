/**
 * Map library finish reasons to AI SDK finish reasons
 */

import type { LanguageModelV3FinishReason } from "@ai-sdk/provider";

type LibraryFinishReason =
  | "stop"
  | "length"
  | "content-filter"
  | "tool-calls"
  | "error"
  | "other"
  | "validation_failed";

/**
 * Map internal finish reasons to AI SDK V3 finish reasons
 */
export function mapFinishReason(
  reason: LibraryFinishReason,
): LanguageModelV3FinishReason {
  switch (reason) {
    case "stop":
      return { unified: "stop", raw: reason };
    case "length":
      return { unified: "length", raw: reason };
    case "content-filter":
      return { unified: "content-filter", raw: reason };
    case "tool-calls":
      return { unified: "tool-calls", raw: reason };
    case "error":
      return { unified: "error", raw: reason };
    case "validation_failed":
      return { unified: "error", raw: reason };
    case "other":
    default:
      return { unified: "other", raw: reason };
  }
}
