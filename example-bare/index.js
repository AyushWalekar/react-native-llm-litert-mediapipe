/**
 * Example app entry point demonstrating the react-native-llm-litert-mediapipe library.
 *
 * IMPORTANT: The setupAiSdkPolyfills() call must be at the very top of this file,
 * before any other imports that might use streams or the AI SDK.
 */

// STEP 1: Set up AI SDK polyfills (MUST be called before other imports)
// This sets up all required polyfills for AI SDK streaming in React Native:
// - Symbol.asyncIterator
// - TextEncoder/TextDecoder
// - ReadableStream/WritableStream/TransformStream
// - TextEncoderStream/TextDecoderStream
// - structuredClone
// - URL.protocol
import { setupAiSdkPolyfills } from 'react-native-llm-litert-mediapipe';

setupAiSdkPolyfills({ verbose: true });

// STEP 2: Now import React Native and your app
import { AppRegistry } from 'react-native';
import RootNavigator from './src/RootNavigator';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => RootNavigator);
