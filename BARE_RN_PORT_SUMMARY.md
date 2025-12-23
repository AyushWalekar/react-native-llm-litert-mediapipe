# Summary: react-native-llm-litert-mediapipe Bare RN Port

## Project Structure

```
react-native-llm-litert-mediapipe/
├── src/                          # TypeScript source
│   ├── index-bare.ts            # Main entry point
│   ├── NativeMediaPipeLlm.ts    # Native bridge wrapper
│   ├── MediaPipeLlmModule.ts    # useLLM hook & utilities
│   ├── MediaPipeLlm.types.ts    # Type definitions
│   └── ModelManagerBare.ts      # Model download manager
├── lib/                          # Compiled JS output
├── android/
│   ├── build.gradle             # Uses com.facebook.react:react-android
│   └── src/main/java/com/mediapipellm/
│       ├── MediaPipeLlmPackage.kt   # ReactPackage
│       ├── MediaPipeLlmModule.kt    # ReactContextBaseJavaModule with @ReactMethod
│       └── LlmInferenceModel.kt     # MediaPipe LLM wrapper
├── ios/
│   ├── react-native-llm-litert-mediapipe.podspec
│   ├── MediaPipeLlm.swift           # RCTEventEmitter native module
│   ├── LlmInferenceModelBare.swift  # MediaPipe wrapper
│   └── MediaPipeLlm-Bridging-Header.h
├── example-bare/                 # Test app (RN 0.79.6)
│   ├── src/App.tsx
│   ├── metro.config.js
│   ├── package.json
│   ├── android/
│   │   ├── settings.gradle      # includes :react-native-llm-litert-mediapipe
│   │   └── app/
│   │       ├── build.gradle     # implementation project(':react-native-llm-litert-mediapipe')
│   │       └── src/main/java/.../MainApplication.kt  # adds MediaPipeLlmPackage()
│   └── ios/
│       └── Podfile
├── package.json
├── tsconfig.bare.json
└── react-native-llm-litert-mediapipe.podspec
```

---

## Native Bridge Pattern

### TypeScript Side (`src/NativeMediaPipeLlm.ts`)

```typescript
import { NativeModules, NativeEventEmitter } from 'react-native';

const { MediaPipeLlm } = NativeModules;
export const MediaPipeLlmEventEmitter = new NativeEventEmitter(MediaPipeLlm);
export default MediaPipeLlm;
```

### Android Side (`android/src/main/java/com/mediapipellm/MediaPipeLlmModule.kt`)

```kotlin
class MediaPipeLlmModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {
    
    override fun getName() = "MediaPipeLlm"
    
    @ReactMethod
    fun createModel(modelPath: String, options: ReadableMap, promise: Promise) { ... }
    
    @ReactMethod
    fun generateResponseAsync(modelId: String, prompt: String, promise: Promise) { ... }
    
    // Sends events via:
    // reactApplicationContext.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
    //     .emit("onPartialResponse", params)
}
```

### Package Registration (`MediaPipeLlmPackage.kt`)

```kotlin
class MediaPipeLlmPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext) =
        listOf(MediaPipeLlmModule(reactContext))
    override fun createViewManagers(reactContext: ReactApplicationContext) = emptyList()
}
```

---

## example-bare Configuration

### package.json

```json
{
  "dependencies": {
    "react": "19.0.0",
    "react-native": "0.79.6",
    "react-native-llm-litert-mediapipe": "file:.."
  }
}
```

### metro.config.js (current)

```javascript
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');
const path = require('path');

const parentPackagePath = path.resolve(__dirname, '..');

const config = {
  watchFolders: [parentPackagePath],
  resolver: {
    nodeModulesPaths: [
      path.resolve(__dirname, 'node_modules'),
      path.resolve(parentPackagePath, 'node_modules'),
    ],
    extraNodeModules: {
      'react-native-llm-litert-mediapipe': parentPackagePath,
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
```

### android/settings.gradle

```gradle
include ':react-native-llm-litert-mediapipe'
project(':react-native-llm-litert-mediapipe').projectDir = new File(rootProject.projectDir, '../../android')
```

### android/app/build.gradle

```gradle
dependencies {
    implementation project(':react-native-llm-litert-mediapipe')
}
```

### MainApplication.kt

```kotlin
import com.mediapipellm.MediaPipeLlmPackage

override fun getPackages(): List<ReactPackage> =
    PackageList(this).packages.apply {
        add(MediaPipeLlmPackage())
    }
```

---

## Current Issue

### Error
Metro can't resolve `react-native-llm-litert-mediapipe` from App.tsx:

```
ERROR  Error: Unable to resolve module react-native-llm-litert-mediapipe from 
/Users/.../example-bare/src/App.tsx: react-native-llm-litert-mediapipe could not be 
found within the project or in these directories:
  node_modules
  ../node_modules
```

### Root Cause
The `file:..` dependency in package.json creates a symlink, but Metro isn't following it properly despite the `extraNodeModules` and `watchFolders` config.

### Main package.json entry points

```json
{
  "main": "lib/index-bare.js",
  "react-native": "src/index-bare.ts",
  "source": "src/index-bare.ts"
}
```

---

## Status

### What Works
- ✅ Android Gradle build succeeds
- ✅ APK installs and launches on device
- ✅ Native module compiles (MediaPipeLlmPackage registered)
- ✅ TypeScript compiles to lib/

### What Needs Fixing
- ❌ Metro bundler can't resolve the symlinked parent package at runtime
