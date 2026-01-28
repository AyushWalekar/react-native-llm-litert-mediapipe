import { Platform } from 'react-native';
import structuredClone from '@ungap/structured-clone';
import { TransformStream, ReadableStream, WritableStream } from 'web-streams-polyfill';
import { TextEncoderStream, TextDecoderStream } from '@stardazed/streams-text-encoding';
import 'fast-text-encoding'; // Polyfills TextEncoder and TextDecoder globally
import { AppRegistry } from 'react-native';
import RootNavigator from './src/RootNavigator';
import { name as appName } from './app.json';

// Import polyfills from the library
// These are required for AI SDK compatibility
import {
    needsURLProtocolPatch,
    patchURLProtocol,
} from 'react-native-llm-litert-mediapipe';

if (typeof process === 'undefined') {
    global.process = { env: {} };
}

// CRITICAL: Polyfill Symbol.asyncIterator for Hermes
// Hermes doesn't have Symbol.asyncIterator by default, which breaks async iteration
if (typeof Symbol.asyncIterator === 'undefined') {
    console.log('[Polyfill] Symbol.asyncIterator is undefined, creating polyfill...');
    Symbol.asyncIterator = Symbol.for('Symbol.asyncIterator');
    console.log('[Polyfill] Symbol.asyncIterator polyfilled:', Symbol.asyncIterator);
}

/**
 * Add Symbol.asyncIterator to a ReadableStream class prototype
 * This enables for await...of loops over streams
 */
function addAsyncIteratorToReadableStream(ReadableStreamClass) {
    if (!ReadableStreamClass || !ReadableStreamClass.prototype) {
        return;
    }

    // Always add/override the asyncIterator to ensure it works
    ReadableStreamClass.prototype[Symbol.asyncIterator] = function () {
        const reader = this.getReader();
        let released = false;

        return {
            async next() {
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
                    try { reader.releaseLock(); } catch (e) { }
                    throw error;
                }
            },
            async return() {
                if (!released) {
                    released = true;
                    try { reader.releaseLock(); } catch (e) { }
                }
                return { done: true, value: undefined };
            },
            [Symbol.asyncIterator]() {
                return this;
            }
        };
    };

    console.log('[Polyfill] Added Symbol.asyncIterator to ReadableStream.prototype');
}

if (Platform.OS !== 'web') {
    console.log('[Polyfill] Starting stream polyfill setup...');
    console.log('[Polyfill] ReadableStream exists:', !!ReadableStream);
    console.log('[Polyfill] ReadableStream.prototype exists:', !!ReadableStream?.prototype);
    console.log('[Polyfill] Symbol.asyncIterator:', Symbol.asyncIterator);
    console.log('[Polyfill] Before patch - has asyncIterator:', typeof ReadableStream?.prototype?.[Symbol.asyncIterator]);

    // IMPORTANT: Add asyncIterator to the imported ReadableStream BEFORE setting global
    // This ensures the prototype is patched on the actual class we're using
    addAsyncIteratorToReadableStream(ReadableStream);

    console.log('[Polyfill] After patch - has asyncIterator:', typeof ReadableStream?.prototype?.[Symbol.asyncIterator]);

    global.TransformStream = TransformStream;
    global.ReadableStream = ReadableStream;
    global.WritableStream = WritableStream;
    global.TextEncoderStream = TextEncoderStream;
    global.TextDecoderStream = TextDecoderStream;
    global.structuredClone = structuredClone;
    
    console.log('[Polyfill] TextEncoder available:', typeof global.TextEncoder);
    console.log('[Polyfill] TextDecoder available:', typeof global.TextDecoder);

    console.log('[Polyfill] Global ReadableStream set, checking asyncIterator:', typeof global.ReadableStream?.prototype?.[Symbol.asyncIterator]);

    // Patch URL.protocol for AI SDK compatibility with multimodal input
    // React Native's URL implementation throws "not implemented" for protocol
    console.log(`URL patch needed: ${needsURLProtocolPatch() ? 'Yes' : 'No'}`);
    patchURLProtocol();

    const setupPolyfills = async () => {
        const { polyfillGlobal } = await import(
            'react-native/Libraries/Utilities/PolyfillFunctions'
        );

        const { TextEncoderStream, TextDecoderStream } = await import(
            '@stardazed/streams-text-encoding'
        );

        if (!('structuredClone' in global)) {
            console.log('Polyfilling structuredClone');
            polyfillGlobal('structuredClone', () => structuredClone);
        }

        polyfillGlobal('TextEncoderStream', () => TextEncoderStream);
        polyfillGlobal('TextDecoderStream', () => TextDecoderStream);
    };

    setupPolyfills();
}

AppRegistry.registerComponent(appName, () => RootNavigator);
