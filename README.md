# react-native-llm-litert-mediapipe

React Native module for on-device LLM inference using Google MediaPipe. Supports Gemma 3n and other MediaPipe-compatible models.

**No Expo required!** This is a bare React Native package.

## Features

- 🚀 On-device LLM inference (no cloud required)
- 📱 Supports Android (24+) and iOS (14+)
- 🎨 Multimodal support (images/audio) on Android with Gemma 3n
- 📥 Built-in model download management
- ⚡ Streaming response generation
- 🔧 React hooks for easy integration

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

## Usage

### Basic Usage with useLLM Hook

```tsx
import { useLLM } from 'react-native-llm-litert-mediapipe';

function ChatScreen() {
  const {
    downloadModel,
    loadModel,
    generateStreamingResponse,
    isLoaded,
    downloadStatus,
    downloadProgress,
  } = useLLM({
    modelUrl: 'https://your-model-url/gemma-3n-e4b.task',
    modelName: 'gemma-3n-e4b.task',
    maxTokens: 1024,
    topK: 40,
    temperature: 0.8,
    randomSeed: 42,
  });

  // Download the model first
  const handleDownload = async () => {
    await downloadModel({
      headers: { 'Authorization': 'Bearer YOUR_HF_TOKEN' }, // If needed
    });
  };

  // Load after download completes
  const handleLoad = async () => {
    await loadModel();
  };

  // Generate responses
  const handleGenerate = async (prompt: string) => {
    let response = '';
    await generateStreamingResponse(
      prompt,
      (partial) => {
        response += partial;
        console.log('Partial:', partial);
      },
      (error) => console.error('Error:', error)
    );
    console.log('Full response:', response);
  };

  return (
    // Your UI here
  );
}
```

### Multimodal Support (Android Only)

Gemma 3n supports image and audio inputs on Android:

```tsx
const { addImage, addAudio, generateStreamingResponse, isLoaded } = useLLM({
  modelUrl: MODEL_URL,
  modelName: 'gemma-3n-e4b.task',
  enableVisionModality: true,  // Enable image support
  enableAudioModality: true,   // Enable audio support (mono WAV)
  maxNumImages: 10,
});

// Add image before generating
await addImage('/path/to/image.jpg');
await generateStreamingResponse('What do you see in this image?', onPartial);

// Add audio before generating
await addAudio('/path/to/audio.wav'); // Must be mono WAV
await generateStreamingResponse('What was said in this audio?', onPartial);
```

### Using ModelManager for Manual Control

```tsx
import { modelManager, MediaPipeLlm } from 'react-native-llm-litert-mediapipe';

// Register models
modelManager.registerModel('gemma-3n', 'https://your-url/gemma-3n.task');

// Download
await modelManager.downloadModel('gemma-3n');

// Create model handle directly
const handle = await MediaPipeLlm.createModelFromDownloaded(
  'gemma-3n',
  1024,  // maxTokens
  40,    // topK
  0.8,   // temperature
  42,    // randomSeed
  { enableVisionModality: true }
);

// Generate
await MediaPipeLlm.generateResponseAsync(handle, requestId, prompt);

// Clean up
await MediaPipeLlm.releaseModel(handle);
```

## API Reference

### useLLM Hook

| Prop | Type | Description |
|------|------|-------------|
| `modelUrl` | `string` | URL to download the model from |
| `modelName` | `string` | Local filename for the model |
| `maxTokens` | `number` | Maximum tokens to generate (default: 512) |
| `topK` | `number` | Top-K sampling (default: 40) |
| `temperature` | `number` | Sampling temperature (default: 0.8) |
| `randomSeed` | `number` | Random seed for reproducibility |
| `enableVisionModality` | `boolean` | Enable image input (Android only) |
| `enableAudioModality` | `boolean` | Enable audio input (Android only) |
| `maxNumImages` | `number` | Max images per session (default: 10) |

### Return Values

| Value | Type | Description |
|-------|------|-------------|
| `downloadModel` | `(options?) => Promise<boolean>` | Start model download |
| `loadModel` | `() => Promise<void>` | Load downloaded model |
| `generateResponse` | `(prompt, onPartial?, onError?) => Promise<string>` | Generate complete response |
| `generateStreamingResponse` | `(prompt, onPartial?, onError?) => Promise<void>` | Stream response tokens |
| `addImage` | `(imagePath) => Promise<boolean>` | Add image to session (Android) |
| `addAudio` | `(audioPath) => Promise<boolean>` | Add audio to session (Android) |
| `isLoaded` | `boolean` | Whether model is ready |
| `downloadStatus` | `string` | Current download status |
| `downloadProgress` | `number` | Download progress (0-1) |
| `downloadError` | `string \| null` | Download error message |

## Supported Models

- **Gemma 3n E4B** - Recommended for on-device inference
- Other MediaPipe LLM-compatible `.task` files

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
await downloadModel({
  headers: { 'Authorization': 'Bearer YOUR_TOKEN' }
});
```

## License

MIT
