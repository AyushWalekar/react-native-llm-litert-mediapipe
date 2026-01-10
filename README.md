# react-native-llm-litert-mediapipe

React Native module for on-device LLM inference using LiteRT/MediaPipe. Supports Gemma 3n and other compatible models.

**No Expo required!** This is a bare React Native package.

## Features

- 🚀 On-device LLM inference (no cloud required)
- 📱 Supports Android (SDK 24+) and iOS (14+)
- 🎨 Multimodal support (images/audio) on Android with Gemma 3n
- 📥 Built-in model download management
- ⚡ Streaming response generation
- 🔧 AI SDK compatible API design

## Installation

```bash
# npm
npm install react-native-llm-litert-mediapipe

# yarn
yarn add react-native-llm-litert-mediapipe
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

  // Load the model
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
  type: 'file' | 'asset',
  path: string,          // for type: 'file'
  name: string,          // for type: 'asset'
  config: {
    maxTokens?: number,      // Maximum tokens to generate (default: 1024)
    topK?: number,           // Top-K sampling (default: 40)
    temperature?: number,    // Sampling temperature (default: 0.8)
    randomSeed?: number,     // Random seed for reproducibility
    enableVisionModality?: boolean,  // Enable image input (Android only)
    enableAudioModality?: boolean,   // Enable audio input (Android only)
    maxNumImages?: number,   // Max images per session (default: 10)
  }
});
```

#### Return Values

| Property | Type | Description |
|----------|------|-------------|
| `model` | `LLMModel \| null` | The loaded model instance |
| `isLoaded` | `boolean` | Whether the model is ready |
| `isLoading` | `boolean` | Whether the model is loading |
| `isGenerating` | `boolean` | Whether text generation is in progress |
| `error` | `string \| null` | Error message if loading failed |
| `loadModel` | `() => Promise<void>` | Load the model |
| `unloadModel` | `() => Promise<void>` | Unload and release resources |
| `generate` | `(messages, options?) => Promise<GenerateTextResult>` | Generate complete response |
| `stream` | `(messages, options?) => Promise<StreamTextResult>` | Stream response tokens |
| `cancel` | `() => Promise<void>` | Cancel ongoing generation |

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
} from 'react-native-llm-litert-mediapipe';

// Load model
const model = await loadModel('/path/to/model.litertlm', {
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
import { modelManager } from 'react-native-llm-litert-mediapipe';

// Register a model
modelManager.registerModel('gemma-3n', 'https://your-url/gemma-3n.litertlm');

// Download
await modelManager.downloadModel('gemma-3n', {
  headers: { Authorization: 'Bearer YOUR_TOKEN' },
});

// Check status
const model = modelManager.getModel('gemma-3n');
console.log(model?.status); // 'downloaded'

// Delete
await modelManager.deleteModel('gemma-3n');
```

### Multimodal Support (Android Only)

Gemma 3n supports image and audio inputs on Android:

```tsx
import { useLlm, type ModelMessage, type ImagePart, type FilePart } from 'react-native-llm-litert-mediapipe';

const { generate } = useLlm({
  type: 'file',
  path: MODEL_PATH,
  config: {
    enableVisionModality: true,
    enableAudioModality: true,
  },
});

// With image
const messages: ModelMessage[] = [
  {
    role: 'user',
    content: [
      { type: 'image', image: '/path/to/image.jpg', mediaType: 'image/jpeg' },
      { type: 'text', text: 'What do you see in this image?' },
    ],
  },
];
const result = await generate(messages);

// With audio
const messagesWithAudio: ModelMessage[] = [
  {
    role: 'user',
    content: [
      { type: 'file', data: '/path/to/audio.wav', mediaType: 'audio/wav' },
      { type: 'text', text: 'Transcribe this audio' },
    ],
  },
];
```

## Message Format

Messages follow the AI SDK compatible format:

```tsx
type ModelMessage = 
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | ContentPart[] }
  | { role: 'assistant'; content: string | TextPart[] };

type ContentPart = TextPart | ImagePart | FilePart;

type TextPart = { type: 'text'; text: string };
type ImagePart = { type: 'image'; image: string; mediaType?: string };
type FilePart = { type: 'file'; data: string; mediaType: string; filename?: string };
```

## Supported Models

- **Gemma 3n E4B** - Recommended for on-device inference
- Other LiteRT/MediaPipe compatible `.litertlm` or `.task` files

## Platform Requirements

| Platform | Minimum Version | Multimodal Support |
|----------|-----------------|-------------------|
| Android | SDK 24 (Android 7.0) | ✅ Full (vision + audio) |
| iOS | 14.0 | ❌ Text only |

## Troubleshooting

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
await modelManager.downloadModel('gemma-3n', {
  headers: { Authorization: 'Bearer YOUR_TOKEN' },
});
```

## License

MIT
