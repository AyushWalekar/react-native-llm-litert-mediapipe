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
import { Recorder } from '@react-native-community/audio-toolkit';

// Gemma 3n E4B model URL (you'll need to provide your own URL or use HuggingFace)
const MODEL_URL = 'https://huggingface.co/example/gemma-3n-e4b/resolve/main/gemma-3n-e4b.task';
const MODEL_NAME = 'gemma-3n-e4b.task';

// Fixed local model path (Android) for re-loading an already-copied model
const FIXED_LOCAL_MODEL_PATH_ANDROID =
  '/data/user/0/com.mediapipellmexample/files/16f676c9-6155-462a-a8bf-59247fc4c07b/gemma-3n-E4B-it-int4.task';

export default function App() {
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [localModelPath, setLocalModelPath] = useState<string | null>(null);
  const [localModelName, setLocalModelName] = useState<string | null>(null);
  const [localModelError, setLocalModelError] = useState<string | null>(null);
  
  // Multimodal state
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recorder, setRecorder] = useState<Recorder | null>(null);

  const downloadableLlm = useLLM({
    modelUrl: MODEL_URL,
    modelName: MODEL_NAME,
    maxTokens: 1024,
    topK: 40,
    temperature: 0.8,
    randomSeed: 42,
    // Enable multimodal for Gemma 3n (Android only)
    enableVisionModality: Platform.OS === 'android',
    enableAudioModality: false,
  });

  const {
    downloadModel,
    loadModel,
    downloadStatus,
    downloadProgress,
    downloadError,
    isCheckingStatus,
  } = downloadableLlm;

  const localLlm = useLLM({
    storageType: 'file',
    modelPath: localModelPath ?? '',
    maxTokens: 1024,
    topK: 40,
    temperature: 0.8,
    randomSeed: 42,
    enableVisionModality: Platform.OS === 'android',
    enableAudioModality: false,
  });

  const usingLocalModel = Boolean(localModelPath);
  const activeLlm = useMemo(
    () => (usingLocalModel ? localLlm : downloadableLlm),
    [usingLocalModel, localLlm, downloadableLlm]
  );
  const { generateStreamingResponse, isLoaded, addImage, addAudio } = activeLlm;

  // Cleanup recorder on unmount
  useEffect(() => {
    return () => {
      if (recorder) {
        recorder.destroy();
      }
    };
  }, [recorder]);

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
  }, []);

  const handleLoadExistingLocalModel = useCallback(() => {
    setLocalModelError(null);

    if (Platform.OS !== 'android') {
      Alert.alert('Not Supported', 'Local fixed-path loading is Android only.');
      return;
    }

    setLocalModelPath(FIXED_LOCAL_MODEL_PATH_ANDROID);
    setLocalModelName(FIXED_LOCAL_MODEL_PATH_ANDROID.split('/').pop() ?? 'model');
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

  // Audio recording handlers
  const handleStartRecording = useCallback(async () => {
    try {
      const newRecorder = new Recorder('recording.wav');

      newRecorder.prepare((err) => {
        if (err) {
          console.error('Recorder prepare error:', err);
          Alert.alert('Recording Error', 'Failed to prepare recorder');
          return;
        }
        newRecorder.record((recErr) => {
          if (recErr) {
            console.error('Recorder record error:', recErr);
            Alert.alert('Recording Error', 'Failed to start recording');
            return;
          }
          setIsRecording(true);
          setRecorder(newRecorder);
          setAudioUri(null); // Clear previous audio
        });
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Alert.alert('Recording Error', message);
    }
  }, []);

  const handleStopRecording = useCallback(async () => {
    if (!recorder) return;

    recorder.stop((err) => {
      if (err) {
        console.error('Recorder stop error:', err);
      }
      const recordingPath = recorder.fsPath;
      setAudioUri(recordingPath);
      setIsRecording(false);
      setRecorder(null);
      setResponse(''); // Clear previous response
    });
  }, [recorder]);

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
      if (isLoaded) return '✅ Local model loaded and ready';
      return 'Loading local model...';
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
      <View style={styles.header}>
        <Text style={styles.title}>MediaPipe LLM Demo</Text>
        <Text style={styles.subtitle}>Gemma 3n On-Device Inference</Text>
      </View>

      <View style={styles.statusContainer}>
        <Text style={styles.statusText}>{getStatusText()}</Text>
        {usingLocalModel && localModelName && (
          <Text style={styles.statusSubtext}>Local model: {localModelName}</Text>
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

      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.button} onPress={handlePickLocalModel}>
          <Text style={styles.buttonText}>Import Local Model</Text>
        </TouchableOpacity>
        {!usingLocalModel && Platform.OS === 'android' && (
          <TouchableOpacity
            style={[styles.button, styles.secondaryButton]}
            onPress={handleLoadExistingLocalModel}
          >
            <Text style={styles.buttonText}>Load Existing Local Model</Text>
          </TouchableOpacity>
        )}
        {usingLocalModel && (
          <TouchableOpacity
            style={[styles.button, styles.secondaryButton]}
            onPress={handleClearLocalModel}
          >
            <Text style={styles.buttonText}>Use Downloaded Model</Text>
          </TouchableOpacity>
        )}
      </View>

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

          <ScrollView style={styles.responseContainer}>
            <Text style={styles.responseText}>{response || 'Response will appear here...'}</Text>
          </ScrollView>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
    padding: 16,
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
    flex: 1,
    backgroundColor: '#252542',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
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
});
