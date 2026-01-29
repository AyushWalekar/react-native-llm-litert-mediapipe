/**
 * Minimal URL.protocol patch for React Native
 *
 * React Native's URL polyfill throws "URL.protocol is not implemented".
 * AI SDK checks URL.protocol when processing image/file content.
 * This patch adds a working protocol getter without replacing the entire URL class.
 *
 * Usage: Call once at app startup (in index.js), before any AI SDK usage.
 *
 * @example
 * ```javascript
 * // In your index.js (before AppRegistry.registerComponent)
 * import { patchURLProtocol } from 'react-native-llm-litert-mediapipe';
 *
 * patchURLProtocol();
 * ```
 */

// Extended URL interface for React Native's internal implementation
interface ReactNativeURL extends URL {
  _url?: string;
}

/**
 * Patches React Native's URL class to add a working `protocol` getter.
 *
 * This is required for AI SDK compatibility when using multimodal input
 * (images, audio) because AI SDK's internal processing accesses URL.protocol.
 *
 * The patch is safe and idempotent:
 * - Does nothing if URL class doesn't exist
 * - Does nothing if protocol already works
 * - Only patches the protocol getter, leaves everything else unchanged
 *
 * @returns void
 */
export function patchURLProtocol(): void {
  if (typeof global === "undefined" || typeof global.URL === "undefined") {
    // No URL class to patch (not in React Native environment)
    return;
  }

  const URLClass = global.URL as typeof URL;

  // Check if protocol is already working
  try {
    const testUrl = new URLClass("https://example.com");
    // Try to access protocol - if it throws, we need to patch
    const protocol = testUrl.protocol;
    if (protocol === "https:") {
      // Protocol already works correctly, no patch needed
      return;
    }
  } catch {
    // Protocol throws an error, needs patching
  }

  // Patch the protocol getter on the prototype
  Object.defineProperty(URLClass.prototype, "protocol", {
    get: function (this: ReactNativeURL): string {
      // Get the URL string from internal state or toString()
      const urlStr = this._url || this.href || this.toString();

      if (typeof urlStr !== "string") {
        return "";
      }

      // Parse protocol: scheme followed by colon
      // Valid schemes: letter followed by letters, digits, +, -, or .
      const match = urlStr.match(/^([a-zA-Z][a-zA-Z0-9+.-]*:)/);
      return match ? match[1] : "";
    },
    configurable: true,
    enumerable: true,
  });
}

/**
 * Check if URL.protocol needs patching in the current environment.
 *
 * @returns true if patching is needed, false otherwise
 */
export function needsURLProtocolPatch(): boolean {
  if (typeof global === "undefined" || typeof global.URL === "undefined") {
    return false;
  }

  try {
    const testUrl = new global.URL("https://example.com");
    const protocol = testUrl.protocol;
    return protocol !== "https:";
  } catch {
    return true;
  }
}
