import { Platform } from 'react-native';
import structuredClone from '@ungap/structured-clone';
import { TransformStream, ReadableStream, WritableStream } from 'web-streams-polyfill';
import { TextEncoderStream, TextDecoderStream } from '@stardazed/streams-text-encoding';
import { AppRegistry } from 'react-native';
import RootNavigator from './src/RootNavigator';
import { name as appName } from './app.json';

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
