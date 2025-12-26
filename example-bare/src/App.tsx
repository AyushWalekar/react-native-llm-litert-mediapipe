/**
 * Example app demonstrating react-native-llm-litert-mediapipe usage
 * with a downloadable Gemma 3n model and multimodal (image/audio) input
 */
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
  Alert,
  Image,
  KeyboardAvoidingView,
  PermissionsAndroid,
} from 'react-native';

import { useLLM } from 'react-native-llm-litert-mediapipe';
import {
  pick,
  types as documentTypes,
  isErrorWithCode,
  errorCodes,
  keepLocalCopy,
} from '@react-native-documents/picker';
import { launchImageLibrary, Asset } from 'react-native-image-picker';
import * as AudioRecorder from './AudioRecorderJS';

// Gemma 3n E4B model URL (you'll need to provide your own URL or use HuggingFace)
const MODEL_URL = 'https://huggingface.co/example/gemma-3n-e4b/resolve/main/gemma-3n-e4b.task';
const MODEL_NAME = 'gemma-3n-e4b.task';

// Preset local model paths (Android) for quick testing
// MediaPipe .task model (vision support, limited audio)
const PRESET_MEDIAPIPE_MODEL_PATH =
  '/data/user/0/com.mediapipellmexample/files/16f676c9-6155-462a-a8bf-59247fc4c07b/gemma-3n-E4B-it-int4.task';

// LiteRT-LM .litertlm model (full audio support)
const PRESET_LITERTLM_MODEL_PATH =
  '/data/user/0/com.mediapipellmexample/files/litert/gemma-3n-E4B-it-int4.litertlm';

// Detect model type from path
const isLiteRtLmModel = (path: string) => path.toLowerCase().endsWith('.litertlm');
const isMediaPipeModel = (path: string) => path.toLowerCase().endsWith('.task');

export default function App() {
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [localModelPath, setLocalModelPath] = useState<string | null>(null);
  const [localModelName, setLocalModelName] = useState<string | null>(null);
  const [localModelError, setLocalModelError] = useState<string | null>(null);
  const [modelEngineType, setModelEngineType] = useState<'mediapipe' | 'litertlm' | null>(null);
  
  // Multimodal state
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [audioDuration, setAudioDuration] = useState<number | null>(null);
  const scrollViewRef = React.useRef<ScrollView>(null);

  const downloadableLlm = useLLM({
    modelUrl: MODEL_URL,
    modelName: MODEL_NAME,
    maxTokens: 1024,
    topK: 40,
    temperature: 0.8,
    randomSeed: 42,
    // Enable multimodal for Gemma 3n (Android only)
    enableVisionModality: Platform.OS === 'android',
    enableAudioModality: true,
  });

  const {
    downloadModel,
    loadModel,
    downloadStatus,
    downloadProgress,
    downloadError,
    isCheckingStatus,
  } = downloadableLlm;

  // Detect engine type when local model path changes
  React.useEffect(() => {
    if (localModelPath) {
      if (isLiteRtLmModel(localModelPath)) {
        setModelEngineType('litertlm');
      } else if (isMediaPipeModel(localModelPath)) {
        setModelEngineType('mediapipe');
      } else {
        setModelEngineType(null);
      }
    } else {
      setModelEngineType(null);
    }
  }, [localModelPath]);

  // Local model hook - multimodal options depend on detected engine type
  const localLlm = useLLM({
    storageType: 'file',
    modelPath: localModelPath ?? '',
    maxTokens: 1024,
    topK: 40,
    temperature: 0.8,
    randomSeed: 42,
    enableVisionModality: true,
    // Audio: enable for LiteRT-LM models (MediaPipe .task may not have AudioEncoder)
    enableAudioModality: Platform.OS === 'android' && modelEngineType === 'litertlm',
  });

  const usingLocalModel = Boolean(localModelPath);
  const activeLlm = useMemo(
    () => (usingLocalModel ? localLlm : downloadableLlm),
    [usingLocalModel, localLlm, downloadableLlm]
  );
  const { generateStreamingResponse, isLoaded, addImage, addAudio } = activeLlm;

  // Cleanup any active recording on unmount
  useEffect(() => {
    return () => {
      if (isRecording) {
        AudioRecorder.cancelRecording().catch(() => {});
      }
    };
  }, [isRecording]);

  const handleDownload = useCallback(async () => {
    try {
      await downloadModel({
        // Add HuggingFace token if needed
        // headers: { 'Authorization': 'Bearer YOUR_HF_TOKEN' },
      });
    } catch (error) {
      console.error('Download error:', error);
    }
  }, [downloadModel]);

  const handleLoad = useCallback(async () => {
    try {
      await loadModel();
    } catch (error) {
      console.error('Load error:', error);
    }
  }, [loadModel]);

  const handlePickLocalModel = useCallback(async () => {
    setLocalModelError(null);
    try {
      const picked = await pick({
        type: [documentTypes.allFiles],
      });
      const selected = picked[0];
      if (!selected?.uri) {
        setLocalModelError('Unable to access the selected file.');
        return;
      }
      console.log('Picked local model:', selected);
      let pickedUri = selected.uri;
      if (pickedUri.startsWith('content://')) {
        console.log('Copying content URI to local file...');
        const copyResults = await keepLocalCopy({
          files: [
            {
              uri: pickedUri,
              fileName: selected.name ?? 'model.task',
            },
          ],
          destination: 'documentDirectory',
        });
        const copyResult = copyResults[0];
        if (!copyResult || copyResult.status === 'error') {
          const copyError =
            copyResult && 'copyError' in copyResult
              ? copyResult.copyError
              : 'Unable to copy the selected file.';
          setLocalModelError(copyError);
          return;
        }
        pickedUri = copyResult.localUri;
      }
      const normalizedPath = pickedUri.startsWith('file://')
        ? pickedUri.replace('file://', '')
        : pickedUri;
      setLocalModelPath(normalizedPath);
      setLocalModelName(selected.name ?? normalizedPath.split('/').pop() ?? 'model');
    } catch (error) {
      if (isErrorWithCode(error) && error.code === errorCodes.OPERATION_CANCELED) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      setLocalModelError(message);
      Alert.alert('Import failed', message);
    }
  }, []);

  const handleClearLocalModel = useCallback(() => {
    setLocalModelPath(null);
    setLocalModelName(null);
    setLocalModelError(null);
    setModelEngineType(null);
  }, []);

  // Load preset MediaPipe model
  const handleLoadPresetMediaPipe = useCallback(() => {
    setLocalModelError(null);

    if (Platform.OS !== 'android') {
      Alert.alert('Not Supported', 'Local fixed-path loading is Android only.');
      return;
    }

    setLocalModelPath(PRESET_MEDIAPIPE_MODEL_PATH);
    setLocalModelName(PRESET_MEDIAPIPE_MODEL_PATH.split('/').pop() ?? 'model');
  }, []);

  // Load preset LiteRT-LM model
  const handleLoadPresetLiteRtLm = useCallback(() => {
    setLocalModelError(null);

    if (Platform.OS !== 'android') {
      Alert.alert('Not Supported', 'Local fixed-path loading is Android only.');
      return;
    }

    setLocalModelPath(PRESET_LITERTLM_MODEL_PATH);
    setLocalModelName(PRESET_LITERTLM_MODEL_PATH.split('/').pop() ?? 'model');
  }, []);

  // Image picker handler
  const handlePickImage = useCallback(async () => {
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        quality: 0.8,
        selectionLimit: 1,
      });

      if (result.didCancel) {
        return;
      }

      if (result.errorCode) {
        Alert.alert('Image Picker Error', result.errorMessage || 'Unknown error');
        return;
      }

      const selectedAsset: Asset | undefined = result.assets?.[0];
      if (selectedAsset?.uri) {
        setImageUri(selectedAsset.uri);
        setResponse(''); // Clear previous response
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Alert.alert('Image Picker Error', message);
    }
  }, []);

  const handleClearImage = useCallback(() => {
    setImageUri(null);
  }, []);

  // Audio recording handlers using native AudioRecorder (16kHz, mono, PCM16 WAV)
  const handleStartRecording = useCallback(async () => {
    try {
      // Request runtime permission on Android
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          {
            title: 'Audio Recording Permission',
            message: 'This app needs access to your microphone to record audio.',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          }
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert('Permission Denied', 'Audio recording permission is required.');
          return;
        }
      }

      await AudioRecorder.startRecording();
      setIsRecording(true);
      setAudioUri(null); // Clear previous audio
      setAudioDuration(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Recording start error:', message);
      Alert.alert('Recording Error', message);
    }
  }, []);

  const handleStopRecording = useCallback(async () => {
    try {
      const result = await AudioRecorder.stopRecording();
      console.log('Recording stopped:', result);
      setAudioUri(result.path);
      setAudioDuration(result.duration);
      setIsRecording(false);
      setResponse(''); // Clear previous response
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Recording stop error:', message);
      Alert.alert('Recording Error', message);
      setIsRecording(false);
    }
  }, []);

  const handleClearAudio = useCallback(() => {
    setAudioUri(null);
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || !isLoaded) return;

    // iOS doesn't support multimodal yet
    if (Platform.OS === 'ios' && (imageUri || audioUri)) {
      Alert.alert('Not Supported', 'iOS does not support multimodal input yet.');
      return;
    }

    setIsGenerating(true);
    setResponse('');

    try {
      // Add image to session if selected
      if (imageUri && addImage) {
        console.log('Adding image to session:', imageUri);
        const imagePath = imageUri.startsWith('file://') 
          ? imageUri.replace('file://', '') 
          : imageUri;
        await addImage(imagePath);
      }

      // Add audio to session if recorded
      if (audioUri && addAudio) {
        console.log('Adding audio to session:', audioUri);
        await addAudio(audioUri);
      }

      await generateStreamingResponse(
        prompt,
        (partialResponse) => {
          setResponse((prev) => prev + partialResponse);
        },
        (error) => {
          console.error('Generation error:', error);
        }
      );
    } catch (error) {
      console.error('Generate error:', error);
      Alert.alert('Generation Error', error instanceof Error ? error.message : String(error));
    } finally {
      setIsGenerating(false);
    }
  }, [prompt, isLoaded, generateStreamingResponse, imageUri, audioUri, addImage, addAudio]);

  const getStatusText = () => {
    if (usingLocalModel) {
      if (!localModelPath) return 'No local model selected';
      const engineLabel = modelEngineType === 'litertlm' ? '🚀 LiteRT-LM' : modelEngineType === 'mediapipe' ? '🔧 MediaPipe' : '❓ Unknown';
      if (isLoaded) return `✅ ${engineLabel} model loaded and ready`;
      return `Loading ${engineLabel} model...`;
    }
    if (isCheckingStatus) return 'Checking model status...';
    if (downloadStatus === 'not_downloaded') return 'Model not downloaded';
    if (downloadStatus === 'downloading') return `Downloading: ${Math.round(downloadProgress * 100)}%`;
    if (downloadStatus === 'downloaded' && !isLoaded) return 'Ready to load';
    if (isLoaded) return '✅ Model loaded and ready';
    if (downloadStatus === 'error') return `Error: ${downloadError}`;
    return 'Unknown status';
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardAvoider}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.title}>MediaPipe LLM Demo</Text>
            <Text style={styles.subtitle}>Gemma 3n On-Device Inference</Text>
          </View>

          <View style={styles.statusContainer}>
            <Text style={styles.statusText}>{getStatusText()}</Text>
            {usingLocalModel && localModelName && (
              <Text style={styles.statusSubtext}>
                Model: {localModelName}
                {modelEngineType && ` (${modelEngineType === 'litertlm' ? 'LiteRT-LM engine' : 'MediaPipe engine'})`}
              </Text>
            )}
            {!usingLocalModel && downloadStatus === 'downloading' && (
              <View style={styles.progressBar}>
                <View
                  style={[styles.progressFill, { width: `${downloadProgress * 100}%` }]}
                />
              </View>
            )}
            {localModelError && <Text style={styles.errorText}>{localModelError}</Text>}
          </View>

          {/* Model Selection Section */}
          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.button} onPress={handlePickLocalModel}>
              <Text style={styles.buttonText}>📂 Import Model</Text>
            </TouchableOpacity>
            {usingLocalModel && (
              <TouchableOpacity
                style={[styles.button, styles.secondaryButton]}
                onPress={handleClearLocalModel}
              >
                <Text style={styles.buttonText}>Use Downloaded</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Preset Model Buttons (Android only) */}
          {!usingLocalModel && Platform.OS === 'android' && (
            <View style={styles.presetSection}>
              <Text style={styles.presetTitle}>Quick Load Preset Models</Text>
              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={[styles.presetButton, styles.mediapipeButton]}
                  onPress={handleLoadPresetMediaPipe}
                >
                  <Text style={styles.buttonText}>🔧 MediaPipe</Text>
                  <Text style={styles.presetSubtext}>.task (vision)</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.presetButton, styles.litertlmButton]}
                  onPress={handleLoadPresetLiteRtLm}
                >
                  <Text style={styles.buttonText}>🚀 LiteRT-LM</Text>
                  <Text style={styles.presetSubtext}>.litertlm (audio)</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={styles.buttonRow}>
            {!usingLocalModel && downloadStatus === 'not_downloaded' && (
              <TouchableOpacity style={styles.button} onPress={handleDownload}>
                <Text style={styles.buttonText}>Download Model</Text>
              </TouchableOpacity>
            )}

            {!usingLocalModel && downloadStatus === 'downloaded' && !isLoaded && (
              <TouchableOpacity style={styles.button} onPress={handleLoad}>
                <Text style={styles.buttonText}>Load Model</Text>
              </TouchableOpacity>
            )}
          </View>

          {isLoaded && (
            <>
              {/* Multimodal Input Section */}
              {Platform.OS === 'android' && (
                <View style={styles.multimodalSection}>
                  <Text style={styles.sectionTitle}>Multimodal Input (Optional)</Text>
                  
                  {/* Image Input */}
                  <View style={styles.mediaRow}>
                    <TouchableOpacity 
                      style={[styles.mediaButton, imageUri && styles.mediaButtonActive]} 
                      onPress={handlePickImage}
                    >
                      <Text style={styles.mediaButtonText}>
                        {imageUri ? '📷 Change Image' : '📷 Add Image'}
                      </Text>
                    </TouchableOpacity>
                    {imageUri && (
                      <TouchableOpacity 
                        style={styles.clearButton} 
                        onPress={handleClearImage}
                      >
                        <Text style={styles.clearButtonText}>✕</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  
                  {imageUri && (
                    <Image 
                      source={{ uri: imageUri }} 
                      style={styles.imagePreview} 
                      resizeMode="cover"
                    />
                  )}
                  
                  {/* Audio Input */}
                  <View style={styles.mediaRow}>
                    <TouchableOpacity 
                      style={[
                        styles.mediaButton, 
                        isRecording && styles.recordingButton,
                        audioUri && styles.mediaButtonActive
                      ]} 
                      onPress={isRecording ? handleStopRecording : handleStartRecording}
                    >
                      <Text style={styles.mediaButtonText}>
                        {isRecording ? '⏹ Stop Recording' : audioUri ? '🎤 Re-record Audio' : '🎤 Record Audio'}
                      </Text>
                    </TouchableOpacity>
                    {audioUri && !isRecording && (
                      <TouchableOpacity 
                        style={styles.clearButton} 
                        onPress={handleClearAudio}
                      >
                        <Text style={styles.clearButtonText}>✕</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  
                  {audioUri && (
                    <Text style={styles.audioInfo}>
                      Audio recorded: {audioUri.split('/').pop()}
                      {audioDuration ? ` (${audioDuration.toFixed(1)}s, 16kHz mono)` : ''}
                    </Text>
                  )}
                </View>
              )}

              <TextInput
                style={styles.input}
                placeholder="Enter your prompt..."
                placeholderTextColor="#888"
                value={prompt}
                onChangeText={setPrompt}
                multiline
                onFocus={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
              />

              <TouchableOpacity
                style={[styles.button, styles.generateButton, isGenerating && styles.buttonDisabled]}
                onPress={handleGenerate}
                disabled={isGenerating || !prompt.trim() || !isLoaded}
              >
                {isGenerating ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Generate Response</Text>
                )}
              </TouchableOpacity>

              <View style={styles.responseContainer}>
                <Text style={styles.responseText}>{response || 'Response will appear here...'}</Text>
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  keyboardAvoider: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
    paddingTop: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
    marginTop: 4,
  },
  statusContainer: {
    backgroundColor: '#252542',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  statusText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
  },
  statusSubtext: {
    color: '#aaa',
    fontSize: 13,
    marginTop: 6,
    textAlign: 'center',
  },
  errorText: {
    color: '#ff8a8a',
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
  },
  progressBar: {
    height: 8,
    backgroundColor: '#333',
    borderRadius: 4,
    marginTop: 12,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
    borderRadius: 4,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#6C63FF',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    marginHorizontal: 6,
  },
  secondaryButton: {
    backgroundColor: '#3b3b5c',
  },
  generateButton: {
    marginTop: 12,
    alignSelf: 'stretch',
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#252542',
    color: '#fff',
    padding: 16,
    borderRadius: 12,
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  responseContainer: {
    backgroundColor: '#252542',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    minHeight: 140,
  },
  responseText: {
    color: '#fff',
    fontSize: 15,
    lineHeight: 22,
  },
  // Multimodal styles
  multimodalSection: {
    backgroundColor: '#252542',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
  },
  mediaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  mediaButton: {
    flex: 1,
    backgroundColor: '#3b3b5c',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    alignItems: 'center',
  },
  mediaButtonActive: {
    backgroundColor: '#4CAF50',
  },
  recordingButton: {
    backgroundColor: '#e53935',
  },
  mediaButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  clearButton: {
    marginLeft: 8,
    backgroundColor: '#e53935',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  imagePreview: {
    width: '100%',
    height: 150,
    borderRadius: 10,
    marginVertical: 8,
  },
  audioInfo: {
    color: '#aaa',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
  // Preset model selection styles
  presetSection: {
    backgroundColor: '#1e1e3f',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#333',
  },
  presetTitle: {
    color: '#888',
    fontSize: 12,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  presetButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginHorizontal: 4,
    alignItems: 'center',
  },
  mediapipeButton: {
    backgroundColor: '#4a90d9',
  },
  litertlmButton: {
    backgroundColor: '#e67e22',
  },
  presetSubtext: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 11,
    marginTop: 4,
  },
});
