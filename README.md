# react-native-llm-litert-mediapipe

React Native module for on-device LLM inference using LiteRT/MediaPipe. Supports Gemma 3n and other compatible models with **AI SDK V3 compatible API**.

**No Expo required!** This is a bare React Native package.

## Features

- 🚀 On-device LLM inference (no cloud required)
- 📱 Supports Android (SDK 24+) and iOS (14+)
- 🎨 Multimodal support (images/audio) on Android with Gemma 3n
- 📥 Built-in model download management
- ⚡ Streaming response generation
- 🔧 **AI SDK V3 compatible** - Use with Vercel AI SDK's `generateText` and `streamText`
- 📝 Structured output support via Zod schemas
- 🔄 Model lifecycle management (load, preload, release)

## Installation

```bash
# npm
npm install react-native-llm-litert-mediapipe

# yarn
yarn add react-native-llm-litert-mediapipe
```

### Install Required Polyfills

For AI SDK compatibility, install these required peer dependencies:

```bash
npm install text-encoding-polyfill web-streams-polyfill @stardazed/streams-text-encoding @ungap/structured-clone
```

### iOS Setup

```bash
cd ios && pod install
```

### Android Setup

1. **Update `android/gradle.properties`** - Increase memory for large model builds:

```properties
org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=4096m
```

2. **Add OpenCL libraries to `android/app/src/main/AndroidManifest.xml`** (inside `<application>`):

```xml
<uses-native-library android:name="libOpenCL.so" android:required="false"/>
<uses-native-library android:name="libOpenCL-car.so" android:required="false"/>
<uses-native-library android:name="libOpenCL-pixel.so" android:required="false"/>
```

3. **Register package** in `MainApplication.kt` (or `.java`):

```kotlin
// In getPackages()
import com.mediapipellm.MediaPipeLlmPackage

override fun getPackages(): List<ReactPackage> {
    val packages = PackageList(this).packages.toMutableList()
    packages.add(MediaPipeLlmPackage())
    return packages
}
```

### Polyfill Setup

**CRITICAL:** For AI SDK streaming to work, you must set up polyfills at the very top of your `index.js` file, before any other imports.

```javascript
// index.js - MUST be at the very top of the file
import { setupAiSdkPolyfills } from 'react-native-llm-litert-mediapipe';

setupAiSdkPolyfills({ verbose: true });

// Now import React Native and your app
import { AppRegistry } from 'react-native';
import App from './App';
AppRegistry.registerComponent('MyApp', () => App);
```

The polyfills set up:
- `Symbol.asyncIterator` for async iteration
- `TextEncoder`/`TextDecoder` with streaming support
- Web Streams API (`ReadableStream`, `WritableStream`, `TransformStream`)
- `TextEncoderStream`/`TextDecoderStream`
- `structuredClone`
- `URL.protocol` for multimodal support

**Note:** If you're using cloud providers (OpenAI, Google, etc.) with AI SDK, the same polyfill setup applies.

### iOS Setup

```bash
cd ios && pod install
```

### Android Setup

1. **Update `android/gradle.properties`** - Increase memory for large model builds:

```properties
org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=4096m
```

2. **Add OpenCL libraries to `android/app/src/main/AndroidManifest.xml`** (inside `<application>`):

```xml
<uses-native-library android:name="libOpenCL.so" android:required="false"/>
<uses-native-library android:name="libOpenCL-car.so" android:required="false"/>
<uses-native-library android:name="libOpenCL-pixel.so" android:required="false"/>
```

3. **Register the package** in `MainApplication.kt` (or `.java`):

```kotlin
// In getPackages()
import com.mediapipellm.MediaPipeLlmPackage

override fun getPackages(): List<ReactPackage> {
    val packages = PackageList(this).packages.toMutableList()
    packages.add(MediaPipeLlmPackage())
    return packages
}
```

## Quick Start

### Option 1: AI SDK Provider (Recommended)

Use the AI SDK compatible provider for the easiest integration:

```tsx
import { generateText, streamText } from 'ai';
import { createMediaPipeLlm } from 'react-native-llm-litert-mediapipe/ai-sdk';

// Create provider with model configuration
const mediapipe = createMediaPipeLlm({
  modelPath: '/path/to/gemma-3n.litertlm',
  config: {
    maxTokens: 1024,
    temperature: 0.8,
    topK: 40,
  },
});

// Generate text
const result = await generateText({
  model: mediapipe('gemma-3n'),
  prompt: 'Hello, how are you?',
});
console.log(result.text);

// Stream text
const stream = await streamText({
  model: mediapipe('gemma-3n'),
  prompt: 'Tell me a short story',
});

for await (const textChunk of stream.textStream) {
  console.log(textChunk);
}
```

### Option 2: React Hook (Basic)

```tsx
import { useLlm, type ModelMessage } from 'react-native-llm-litert-mediapipe';

function ChatScreen() {
  const {
    isLoaded,
    isLoading,
    loadModel,
    generate,
    stream,
    cancel,
  } = useLlm({
    type: 'file',
    path: '/path/to/model.litertlm',
    config: {
      maxTokens: 1024,
      topK: 40,
      temperature: 0.8,
    },
  });

  // Load model
  const handleLoad = async () => {
    await loadModel();
  };

  // Generate a complete response
  const handleGenerate = async (prompt: string) => {
    const messages: ModelMessage[] = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: prompt },
    ];

    const result = await generate(messages);
    console.log('Response:', result.text);
  };

  // Stream responses token by token
  const handleStream = async (prompt: string) => {
    const messages: ModelMessage[] = [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: prompt },
    ];

    const result = await stream(messages);

    for await (const chunk of result.textStream) {
      console.log('Chunk:', chunk);
    }
  };

  return (
    // Your UI here
  );
}
```

## API Reference

### `useLlm` Hook

The main hook for using the LLM API.

```tsx
const llm = useLlm({
  type: "file" | "asset",
  path: string, // for type: 'file'
  name: string, // for type: 'asset'
  config: {
    maxTokens: number, // Maximum tokens to generate (default: 1024)
    topK: number, // Top-K sampling (default: 40)
    temperature: number, // Sampling temperature (default: 0.8)
    randomSeed: number, // Random seed for reproducibility
    enableVisionModality: boolean, // Enable image input (Android only)
    enableAudioModality: boolean, // Enable audio input (Android only)
    maxNumImages: number, // Max images per session (default: 10)
  },
});
```

#### Return Values

| Property       | Type                                                  | Description                            |
| -------------- | ----------------------------------------------------- | -------------------------------------- |
| `model`        | `LLMModel \| null`                                    | The loaded model instance              |
| `isLoaded`     | `boolean`                                             | Whether the model is ready             |
| `isLoading`    | `boolean`                                             | Whether the model is loading           |
| `isGenerating` | `boolean`                                             | Whether text generation is in progress |
| `error`        | `string \| null`                                      | Error message if loading failed        |
| `loadModel`    | `() => Promise<void>`                                 | Load the model                         |
| `unloadModel`  | `() => Promise<void>`                                 | Unload and release resources           |
| `generate`     | `(messages, options?) => Promise<GenerateTextResult>` | Generate complete response             |
| `stream`       | `(messages, options?) => Promise<StreamTextResult>`   | Stream response tokens                 |
| `cancel`       | `() => Promise<void>`                                 | Cancel ongoing generation              |

### Functional API

For more control, you can use the functional API directly:

```tsx
import {
  loadModel,
  loadModelFromAsset,
  generateText,
  streamText,
  releaseModel,
  stopGeneration,
} from "react-native-llm-litert-mediapipe";

// Load model
const model = await loadModel("/path/to/model.litertlm", {
  maxTokens: 1024,
  temperature: 0.8,
});

// Generate text
const result = await generateText(model, messages);
console.log(result.text);

// Stream text
const streamResult = await streamText(model, messages);
for await (const chunk of streamResult.textStream) {
  console.log(chunk);
}

// Clean up
await releaseModel(model);
```

### Model Manager

For managing model downloads:

```tsx
import { modelManager } from "react-native-llm-litert-mediapipe";

// Register a model
modelManager.registerModel("gemma-3n", "https://your-url/gemma-3n.litertlm");

// Download
await modelManager.downloadModel("gemma-3n", {
  headers: { Authorization: "Bearer YOUR_TOKEN" },
});

// Check status
const model = modelManager.getModel("gemma-3n");
console.log(model?.status); // 'downloaded'

// Delete
await modelManager.deleteModel("gemma-3n");
```

## AI SDK Provider (Advanced)

Use the AI SDK V3 compatible provider for full integration with Vercel AI SDK.

### Getting Started

```tsx
import { generateText, streamText, Output } from 'ai';
import { createMediaPipeLlm } from 'react-native-llm-litert-mediapipe/ai-sdk';

// Create provider
const mediapipe = createMediaPipeLlm({
  modelPath: '/path/to/gemma-3n.litertlm',
  config: {
    maxTokens: 1024,
    temperature: 0.8,
  },
});

// Use with AI SDK functions
const result = await generateText({
  model: mediapipe('gemma-3n'),
  prompt: 'Hello!',
});
```

### Text Generation

```tsx
const result = await generateText({
  model: mediapipe('gemma-3n'),
  prompt: 'Explain quantum computing in simple terms.',
});

console.log(result.text);
console.log(result.usage); // { inputTokens: 50, outputTokens: 150 }
console.log(result.finishReason); // 'stop' | 'length' | 'error'
```

### Streaming Generation

```tsx
const result = await streamText({
  model: mediapipe('gemma-3n'),
  prompt: 'Write a poem about AI',
});

for await (const chunk of result.textStream) {
  console.log(chunk); // Tokens streamed one by one
}

console.log(result.fullStream); // Access to all stream parts
```

### Multimodal Input (Images/Audio - Android Only)

Enable multimodal capabilities in provider configuration:

```tsx
const mediapipe = createMediaPipeLlm({
  modelPath: '/path/to/model.litertlm',
  config: {
    enableVisionModality: true,  // Enable image input
    enableAudioModality: true,  // Enable audio input
    maxNumImages: 10,
  },
});
```

Use images in messages:

```tsx
const result = await generateText({
  model: mediapipe('gemma-3n'),
  messages: [
    {
      role: 'user',
      content: [
        { type: 'image', image: '/path/to/image.jpg', mediaType: 'image/jpeg' },
        { type: 'text', text: 'What do you see in this image?' }
      ],
    },
  ],
});
```

**Note:** For multimodal input, use the `experimental_download: noopDownload` option:

```tsx
import { noopDownload } from 'react-native-llm-litert-mediapipe';

const result = await generateText({
  model: mediapipe('gemma-3n'),
  messages: [
    { role: 'user', content: [{ type: 'image', image: '/local/image.jpg' }] }
  ],
  experimental_download: noopDownload, // Skips download of local files
});
```

### Structured Output

Generate JSON responses with schema validation:

```tsx
import { Output } from 'ai';
import { z } from 'zod';

const SentimentSchema = z.object({
  sentiment: z.enum(['positive', 'negative', 'neutral']),
  confidence: z.number(),
  summary: z.string(),
});

const result = await generateText({
  model: mediapipe('gemma-3n'),
  prompt: 'Analyze: "I love this new product!"',
  output: Output.object({ schema: SentimentSchema }),
});

console.log(result.output);
// { sentiment: 'positive', confidence: 0.95, summary: 'User expresses strong positive sentiment' }
```

### Model Lifecycle Management

Control when models are loaded and released:

```tsx
const mediapipe = createMediaPipeLlm({
  modelPath: '/path/to/model.litertlm',
  preload: true, // Load model immediately on app startup
});

// Preload default model
await mediapipe.preload();

// Get a model instance
const model = mediapipe('gemma-3n');

// Check if loaded
console.log(model.isLoaded); // true/false

// Release to free memory
await model.release();

// Release all loaded models
await mediapipe.releaseAll();
```

### Polyfill Utilities

The library provides utilities for handling React Native compatibility issues:

#### `setupAiSdkPolyfills(options)`

One-call setup for all required polyfills. **Must be called at top of index.js**.

```javascript
import { setupAiSdkPolyfills } from 'react-native-llm-litert-mediapipe';

setupAiSdkPolyfills({ verbose: true });
```

Options:
- `verbose: boolean` - Enable logging (default: false)
- `skipSymbolAsyncIterator: boolean` - Skip Symbol.asyncIterator polyfill
- `skipURLProtocol: boolean` - Skip URL.protocol polyfill

#### `checkPolyfillStatus()`

Check if all polyfills are set up correctly.

```javascript
import { checkPolyfillStatus } from 'react-native-llm-litert-mediapipe';

const status = checkPolyfillStatus();
console.log(status.allReady); // true if everything is set up
console.log(status.textDecoder); // { true: true, ... }
```

#### `makeAsyncIterable<T>(stream)`

Make any ReadableStream async iterable (for cloud providers):

```tsx
import { streamText } from 'ai';
import { makeAsyncIterable } from 'react-native-llm-litert-mediapipe';

const result = await streamText({ model: openai('gpt-4o'), prompt: '...' });

for await (const chunk of makeAsyncIterable(result.textStream)) {
  console.log(chunk);
}
```

#### `streamToAsyncGenerator<T>(stream)`

Async generator wrapper for streams:

```tsx
import { streamText } from 'ai';
import { streamToAsyncGenerator } from 'react-native-llm-litert-mediapipe';

for await (const chunk of streamToAsyncGenerator(result.textStream)) {
  console.log(chunk);
}
```

#### `patchURLProtocol()`

Patch URL.protocol for multimodal support:

```javascript
import { patchURLProtocol, needsURLProtocolPatch } from 'react-native-llm-litert-mediapipe';

if (needsURLProtocolPatch()) {
  patchURLProtocol();
}
```

### Cloud Providers

The same polyfill setup works for cloud providers (OpenAI, Google, etc.):

```tsx
import { createOpenAI } from '@ai-sdk/openai';
import { streamText, generateText } from 'ai';

const openai = createOpenAI({ apiKey: 'YOUR_KEY' });

const result = await streamText({
  model: openai('gpt-4o-mini'),
  prompt: 'Hello from cloud!',
});

for await (const chunk of result.textStream) {
  console.log(chunk);
}
```

**Important:** Use `react-native-fetch-api` with `streamingFetch` for cloud providers:

```tsx
import { createOpenAI } from '@ai-sdk/openai';
import { fetch as streamingFetch } from 'react-native-fetch-api';

const openai = createOpenAI({
  apiKey: 'YOUR_KEY',
  fetch: (url, options) =>
    streamingFetch(url, { ...options, reactNative: { textStreaming: true } }),
});
```

### Functional API

Gemma 3n supports image and audio inputs on Android:

```tsx
import {
  useLlm,
  type ModelMessage,
  type ImagePart,
  type FilePart,
} from "react-native-llm-litert-mediapipe";

const { generate } = useLlm({
  type: "file",
  path: MODEL_PATH,
  config: {
    enableVisionModality: true,
    enableAudioModality: true,
  },
});

// With image
const messages: ModelMessage[] = [
  {
    role: "user",
    content: [
      { type: "image", image: "/path/to/image.jpg", mediaType: "image/jpeg" },
      { type: "text", text: "What do you see in this image?" },
    ],
  },
];
const result = await generate(messages);

// With audio
const messagesWithAudio: ModelMessage[] = [
  {
    role: "user",
    content: [
      { type: "file", data: "/path/to/audio.wav", mediaType: "audio/wav" },
      { type: "text", text: "Transcribe this audio" },
    ],
  },
];
```

## Message Format

Messages follow the AI SDK compatible format:

```tsx
type ModelMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string | ContentPart[] }
  | { role: "assistant"; content: string | TextPart[] };

type ContentPart = TextPart | ImagePart | FilePart;

type TextPart = { type: "text"; text: string };
type ImagePart = { type: "image"; image: string; mediaType?: string };
type FilePart = {
  type: "file";
  data: string;
  mediaType: string;
  filename?: string;
};
```

## Supported Models

- **Gemma 3n E4B** - Recommended for on-device inference (4B parameters)
- **Gemma 3n E2B** - Smaller model (2B parameters), faster inference
- Any LiteRT/MediaPipe compatible `.litertlm` or `.task` files

## Platform Requirements

| Platform | Minimum Version      | Multimodal Support       | AI SDK Support |
| -------- | -------------------- | ------------------------ | --------------- |
| Android  | SDK 24 (Android 7.0) | ✅ Full (vision + audio) | ✅ Full           |
| iOS      | 14.0                 | ❌ Text only             | ✅ Full           |

## Troubleshooting

### AI SDK Streaming Issues

#### "Object is not async iterable"

This happens when `Symbol.asyncIterator` is not polyfilled for React Native's Hermes engine.

**Solution:** Call `setupAiSdkPolyfills()` at the very top of your `index.js`:

```javascript
import { setupAiSdkPolyfills } from 'react-native-llm-litert-mediapipe';
setupAiSdkPolyfills();
```

#### "'stream' option is unsupported"

The AI SDK uses `TextDecoder` with `{ stream: true }` option. Some polyfills don't support this.

**Solution:** Ensure `text-encoding-polyfill` is installed (not `fast-text-encoding`):

```bash
npm install text-encoding-polyfill
```

The library's `setupAiSdkPolyfills()` will automatically use `text-encoding-polyfill` if available.

#### Cloud provider streaming fails

For OpenAI/Google/etc. cloud providers, you need `react-native-fetch-api`:

```bash
npm install react-native-fetch-api
```

```tsx
import { createOpenAI } from '@ai-sdk/openai';
import { fetch as streamingFetch } from 'react-native-fetch-api';

const openai = createOpenAI({
  apiKey: 'YOUR_KEY',
  fetch: (url, options) =>
    streamingFetch(url, { ...options, ReactNative: { textStreaming: true } }),
});
```

### Android: OutOfMemoryError during build

Increase Gradle memory in `gradle.properties`:

```properties
org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=4096m
```

### iOS: Model not found in bundle

Ensure the model file is added to your Xcode project's "Copy Bundle Resources" build phase.

### Download fails with 401

Add authentication headers:

```tsx
await modelManager.downloadModel("gemma-3n", {
  headers: { Authorization: "Bearer YOUR_TOKEN" },
});
```

## License

MIT
