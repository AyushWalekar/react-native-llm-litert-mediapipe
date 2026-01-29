/**
 * Polyfill to add async iteration support to ReadableStream
 *
 * This polyfill adds Symbol.asyncIterator to ReadableStream.prototype to enable
 * for await...of loops over ReadableStream instances, which is required by
 * the AI SDK's streamText function.
 *
 * Issue: In React Native, ReadableStream from web-streams-polyfill may not
 * properly support async iteration, causing "Object is not async iterable" errors.
 *
 * Solution: This polyfill wraps ReadableStreamDefaultReader in an async iterator.
 */

export function patchReadableStreamAsyncIterator(): void {
  if (typeof ReadableStream === 'undefined') {
    return;
  }

  // Check if asyncIterator already exists and works
  if (typeof ReadableStream.prototype[Symbol.asyncIterator] === 'function') {
    return;
  }

  // Add asyncIterator support to ReadableStream.prototype
  ReadableStream.prototype[Symbol.asyncIterator] = function() {
    const reader = this.getReader();
    return {
      async next() {
        const { done, value } = await reader.read();
        if (done) {
          reader.releaseLock();
          return { done: true, value: undefined };
        }
        return { done: false, value };
      },
      async return() {
        reader.releaseLock();
        return { done: true, value: undefined };
      },
      [Symbol.asyncIterator]() {
        return this;
      }
    };
  };
}

/**
 * Check if the ReadableStream async iterator patch is needed
 *
 * @returns true if patch is needed, false otherwise
 */
export function needsReadableStreamAsyncIteratorPatch(): boolean {
  if (typeof ReadableStream === 'undefined') {
    return true;
  }
  return typeof ReadableStream.prototype[Symbol.asyncIterator] !== 'function';
}

/**
 * Type that combines AsyncIterable and ReadableStream
 */
export type AsyncIterableStream<T> = AsyncIterable<T> & ReadableStream<T>;

/**
 * Wraps a ReadableStream to make it async iterable
 *
 * Use this function when you have a stream from a cloud provider (OpenAI, Google, etc.)
 * that needs to be consumed with `for await...of` in React Native.
 *
 * This is necessary because the AI SDK's bundled code may have captured
 * Symbol.asyncIterator before our polyfill ran, resulting in undefined keys.
 *
 * @example
 * ```typescript
 * import { makeAsyncIterable } from 'react-native-llm-litert-mediapipe';
 *
 * const result = streamText({ model, prompt });
 * for await (const chunk of makeAsyncIterable(result.textStream)) {
 *   console.log(chunk);
 * }
 * ```
 */
export function makeAsyncIterable<T>(
  stream: ReadableStream<T>
): AsyncIterableStream<T> {
  // If it already has a working async iterator, return as-is
  if (
    typeof Symbol.asyncIterator !== 'undefined' &&
    typeof (stream as any)[Symbol.asyncIterator] === 'function'
  ) {
    return stream as AsyncIterableStream<T>;
  }

  // Create a new object that wraps the stream with async iteration
  const asyncIterableStream = stream as AsyncIterableStream<T>;

  asyncIterableStream[Symbol.asyncIterator] = function () {
    const reader = this.getReader();
    let released = false;

    return {
      async next(): Promise<IteratorResult<T>> {
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
          } catch (e) {
            // Ignore release errors
          }
          throw error;
        }
      },
      async return(): Promise<IteratorResult<T>> {
        if (!released) {
          released = true;
          try {
            reader.releaseLock();
          } catch (e) {
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

  return asyncIterableStream;
}

/**
 * Async generator that yields values from a ReadableStream
 *
 * Alternative to makeAsyncIterable that doesn't modify the stream object.
 * Use this if you prefer a pure function approach.
 *
 * @example
 * ```typescript
 * import { streamToAsyncGenerator } from 'react-native-llm-litert-mediapipe';
 *
 * const result = streamText({ model, prompt });
 * for await (const chunk of streamToAsyncGenerator(result.textStream)) {
 *   console.log(chunk);
 * }
 * ```
 */
export async function* streamToAsyncGenerator<T>(
  stream: ReadableStream<T>
): AsyncGenerator<T, void, undefined> {
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        return;
      }
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}
