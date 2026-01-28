/**
 * Polyfill Setup for AI SDK Streaming in React Native
 *
 * This module provides a single function to set up all required polyfills
 * for AI SDK streaming to work correctly in React Native.
 *
 * Required peer dependencies (install these in your app):
 * - web-streams-polyfill
 * - @stardazed/streams-text-encoding
 * - fast-text-encoding
 * - @ungap/structured-clone
 *
 * @example
 * ```javascript
 * // In your index.js (BEFORE any other imports except react-native)
 * import { setupAiSdkPolyfills } from 'react-native-llm-litert-mediapipe';
 *
 * setupAiSdkPolyfills();
 *
 * // Now import your app
 * import { AppRegistry } from 'react-native';
 * import App from './App';
 * AppRegistry.registerComponent('MyApp', () => App);
 * ```
 */

import { Platform } from "react-native";
import { patchURLProtocol } from "./patch-url-protocol";

/**
 * Options for polyfill setup
 */
export interface SetupPolyfillsOptions {
  /**
   * Enable verbose logging of polyfill setup
   * @default false
   */
  verbose?: boolean;

  /**
   * Skip Symbol.asyncIterator polyfill
   * Set to true if you're handling this separately
   * @default false
   */
  skipSymbolAsyncIterator?: boolean;

  /**
   * Skip URL.protocol polyfill
   * Set to true if you're handling this separately
   * @default false
   */
  skipURLProtocol?: boolean;
}

/**
 * Add Symbol.asyncIterator to a ReadableStream class prototype
 */
function addAsyncIteratorToReadableStream(
  ReadableStreamClass: typeof ReadableStream,
  log: (...args: unknown[]) => void
): void {
  if (!ReadableStreamClass || !ReadableStreamClass.prototype) {
    return;
  }

  // Add/override the asyncIterator to ensure it works
  (
    ReadableStreamClass.prototype as unknown as Record<symbol, unknown>
  )[Symbol.asyncIterator] = function (this: ReadableStream) {
    const reader = this.getReader();
    let released = false;

    return {
      async next(): Promise<IteratorResult<unknown>> {
        if (released) {
          return { done: true, value: undefined };
        }
        try {
          const { done, value } = await reader.read();
          if (done) {
            released = true;
            reader.releaseLock();
            return { done: true, value: undefined };
          }
          return { done: false, value };
        } catch (error) {
          released = true;
          try {
            reader.releaseLock();
          } catch {
            // Ignore release errors
          }
          throw error;
        }
      },
      async return(): Promise<IteratorResult<unknown>> {
        if (!released) {
          released = true;
          try {
            reader.releaseLock();
          } catch {
            // Ignore release errors
          }
        }
        return { done: true, value: undefined };
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    };
  };

  log("Added Symbol.asyncIterator to ReadableStream.prototype");
}

/**
 * Sets up all required polyfills for AI SDK streaming in React Native.
 *
 * This function must be called at the very top of your index.js file,
 * BEFORE any other imports (except react-native itself).
 *
 * Required packages (install as dependencies in your app):
 * ```bash
 * npm install web-streams-polyfill @stardazed/streams-text-encoding fast-text-encoding @ungap/structured-clone
 * ```
 *
 * @param options - Configuration options
 *
 * @example
 * ```javascript
 * // index.js
 * import { setupAiSdkPolyfills } from 'react-native-llm-litert-mediapipe';
 *
 * setupAiSdkPolyfills({ verbose: true });
 *
 * import { AppRegistry } from 'react-native';
 * import App from './App';
 * AppRegistry.registerComponent('MyApp', () => App);
 * ```
 */
export function setupAiSdkPolyfills(options: SetupPolyfillsOptions = {}): void {
  const { verbose = false, skipSymbolAsyncIterator = false, skipURLProtocol = false } = options;

  const log = verbose
    ? (...args: unknown[]) => console.log("[AI-SDK-Polyfill]", ...args)
    : () => {};

  // Skip on web platform
  if (Platform.OS === "web") {
    log("Web platform detected, skipping polyfills");
    return;
  }

  log("Setting up AI SDK polyfills for React Native...");

  // 1. Polyfill Symbol.asyncIterator (CRITICAL - must be first)
  if (!skipSymbolAsyncIterator && typeof Symbol.asyncIterator === "undefined") {
    log("Polyfilling Symbol.asyncIterator...");
    (Symbol as unknown as Record<string, symbol>).asyncIterator = Symbol.for(
      "Symbol.asyncIterator"
    );
    log("Symbol.asyncIterator polyfilled:", Symbol.asyncIterator);
  }

  // 2. Polyfill process global
  if (typeof process === "undefined") {
    log("Polyfilling process global...");
    (global as unknown as Record<string, unknown>).process = { env: {} };
  }

  // 3. Import and set up stream polyfills
  try {
    // TextEncoder/TextDecoder - use text-encoding-polyfill which supports stream option
    // fast-text-encoding does NOT support stream option which is required by AI SDK
    const encoding = require("text-encoding-polyfill");
    (global as unknown as Record<string, unknown>).TextEncoder = encoding.TextEncoder;
    (global as unknown as Record<string, unknown>).TextDecoder = encoding.TextDecoder;
    log("TextEncoder/TextDecoder polyfilled via text-encoding-polyfill (with stream support)");
  } catch (e) {
    // Fallback to fast-text-encoding (limited, no stream support)
    try {
      require("fast-text-encoding");
      log("TextEncoder/TextDecoder polyfilled via fast-text-encoding (no stream support - cloud streaming may not work)");
    } catch {
      log(
        "Warning: No TextEncoder/TextDecoder polyfill found. Install: npm install text-encoding-polyfill"
      );
    }
  }

  try {
    const {
      TransformStream,
      ReadableStream,
      WritableStream,
    } = require("web-streams-polyfill");

    // Add async iterator to ReadableStream before setting global
    addAsyncIteratorToReadableStream(ReadableStream, log);

    (global as unknown as Record<string, unknown>).TransformStream =
      TransformStream;
    (global as unknown as Record<string, unknown>).ReadableStream =
      ReadableStream;
    (global as unknown as Record<string, unknown>).WritableStream =
      WritableStream;

    log("Stream polyfills set up (ReadableStream, WritableStream, TransformStream)");
  } catch (e) {
    log(
      "Warning: web-streams-polyfill not found. Install it: npm install web-streams-polyfill"
    );
  }

  try {
    const {
      TextEncoderStream,
      TextDecoderStream,
    } = require("@stardazed/streams-text-encoding");

    (global as unknown as Record<string, unknown>).TextEncoderStream =
      TextEncoderStream;
    (global as unknown as Record<string, unknown>).TextDecoderStream =
      TextDecoderStream;

    log("TextEncoderStream/TextDecoderStream polyfilled");
  } catch (e) {
    log(
      "Warning: @stardazed/streams-text-encoding not found. Install it: npm install @stardazed/streams-text-encoding"
    );
  }

  try {
    const structuredClone = require("@ungap/structured-clone").default;
    if (!("structuredClone" in global)) {
      (global as unknown as Record<string, unknown>).structuredClone =
        structuredClone;
      log("structuredClone polyfilled");
    }
  } catch (e) {
    log(
      "Warning: @ungap/structured-clone not found. Install it: npm install @ungap/structured-clone"
    );
  }

  // 4. Patch URL.protocol for multimodal support
  if (!skipURLProtocol) {
    patchURLProtocol();
    log("URL.protocol patched for multimodal support");
  }

  log("AI SDK polyfills setup complete!");
}

/**
 * Check if all required polyfills are set up correctly.
 *
 * @returns Object with status of each required polyfill
 */
export function checkPolyfillStatus(): {
  symbolAsyncIterator: boolean;
  readableStream: boolean;
  readableStreamAsyncIterator: boolean;
  transformStream: boolean;
  writableStream: boolean;
  textEncoder: boolean;
  textDecoder: boolean;
  textEncoderStream: boolean;
  textDecoderStream: boolean;
  structuredClone: boolean;
  urlProtocol: boolean;
  allReady: boolean;
} {
  const g = global as unknown as Record<string, unknown>;

  const symbolAsyncIterator = typeof Symbol.asyncIterator !== "undefined";
  const readableStream = typeof g.ReadableStream === "function";
  const readableStreamAsyncIterator =
    readableStream &&
    typeof (g.ReadableStream as typeof ReadableStream).prototype?.[
      Symbol.asyncIterator
    ] === "function";
  const transformStream = typeof g.TransformStream === "function";
  const writableStream = typeof g.WritableStream === "function";
  const textEncoder = typeof g.TextEncoder === "function";
  const textDecoder = typeof g.TextDecoder === "function";
  const textEncoderStream = typeof g.TextEncoderStream === "function";
  const textDecoderStream = typeof g.TextDecoderStream === "function";
  const structuredClone = typeof g.structuredClone === "function";

  // Check URL.protocol
  let urlProtocol = false;
  try {
    const testUrl = new URL("https://example.com");
    urlProtocol = testUrl.protocol === "https:";
  } catch {
    urlProtocol = false;
  }

  const allReady =
    symbolAsyncIterator &&
    readableStream &&
    readableStreamAsyncIterator &&
    transformStream &&
    writableStream &&
    textEncoder &&
    textDecoder &&
    textEncoderStream &&
    textDecoderStream &&
    structuredClone &&
    urlProtocol;

  return {
    symbolAsyncIterator,
    readableStream,
    readableStreamAsyncIterator,
    transformStream,
    writableStream,
    textEncoder,
    textDecoder,
    textEncoderStream,
    textDecoderStream,
    structuredClone,
    urlProtocol,
    allReady,
  };
}
