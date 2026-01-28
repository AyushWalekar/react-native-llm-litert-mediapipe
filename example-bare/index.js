import { Platform } from 'react-native';
import structuredClone from '@ungap/structured-clone';
import { TransformStream, ReadableStream, WritableStream } from 'web-streams-polyfill';
import { TextEncoderStream, TextDecoderStream } from '@stardazed/streams-text-encoding';
import { AppRegistry } from 'react-native';
import RootNavigator from './src/RootNavigator';
import { name as appName } from './app.json';

// Import the minimal URL protocol patch from the library
// This is required for AI SDK compatibility when using multimodal input (images, audio)
import { needsURLProtocolPatch, patchURLProtocol } from 'react-native-llm-litert-mediapipe';

if (typeof process === 'undefined') {
    global.process = { env: {} };
}

if (Platform.OS !== 'web') {
    global.TransformStream = TransformStream;
    global.ReadableStream = ReadableStream;
    global.WritableStream = WritableStream;
    global.TextEncoderStream = TextEncoderStream;
    global.TextDecoderStream = TextDecoderStream;
    global.structuredClone = structuredClone;

    // Patch URL.protocol for AI SDK compatibility with multimodal input
    // React Native's URL implementation throws "not implemented" for protocol
    console.log(`1:${needsURLProtocolPatch() ? 'Applied' : 'URL.protocol already patched'}`);

    console.log('Patching URL.protocol for React Native');
    patchURLProtocol();

    console.log(`2:${needsURLProtocolPatch() ? 'Applied' : 'URL.protocol already patched'}`);

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
