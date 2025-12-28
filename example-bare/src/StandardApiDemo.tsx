/**
 * Example demonstrating new standardized LLM API
 * AI-SDK compatible interface with ModelMessage format
 * Includes multimodal support (image and audio input)
 */
import React, { useState, useCallback, useRef } from 'react';
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
  PermissionsAndroid,
} from 'react-native';

import {
  useStandardLLM,
  generateText,
  streamText,
  type ModelMessage,
  type TextPart,
  type ImagePart,
  type FilePart,
  type ContentPart,
} from 'react-native-llm-litert-mediapipe';
import { launchImageLibrary, Asset } from 'react-native-image-picker';
import * as AudioRecorder from './AudioRecorderJS';
import RNFS from 'react-native-fs';

const PRESET_MODEL_PATH = Platform.OS === 'android'
  ? `${RNFS.DocumentDirectoryPath}/litert/gemma-3n-E4B-it-int4.litertlm`
  : '';

export default function StandardApiDemo() {
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);

  // Multimodal state
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [audioDuration, setAudioDuration] = useState<number | null>(null);

  const standardLlm = useStandardLLM({
    type: 'file',
    path: PRESET_MODEL_PATH,
    config: {
      maxTokens: 1024,
      topK: 40,
      temperature: 0.8,
      randomSeed: 42,
      enableVisionModality: Platform.OS === 'android',
      enableAudioModality: Platform.OS === 'android',
    },
  });

  const { model, isLoaded, isLoading, error, loadModel, unloadModel, generate, stream, cancel } = standardLlm;
  const scrollViewRef = useRef<ScrollView>(null);

  const handleLoadModel = useCallback(async () => {
    try {
      await loadModel();
      Alert.alert('Success', 'Model loaded successfully');
    } catch (e) {
      Alert.alert('Error', `Failed to load model: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [loadModel]);

  const handleGenerateText = useCallback(async () => {
    if (!prompt.trim() || !model) return;

    // iOS doesn't support multimodal yet
    if (Platform.OS === 'ios' && (imageUri || audioUri)) {
      Alert.alert('Not Supported', 'Multimodal input is only supported on Android.');
      return;
    }

    setIsGenerating(true);
    setResponse('');

    try {
      // Build user content with multimodal parts
      const userContent: ContentPart[] = [];

      // Add image as ImagePart if present
      if (imageUri) {
        const imagePath = imageUri.startsWith('file://') ? imageUri.replace('file://', '') : imageUri;
        userContent.push({
          type: 'image',
          image: imagePath,
          mediaType: 'image/jpeg',
        } as ImagePart);
      }

      // Add audio as FilePart if present
      if (audioUri) {
        const audioPath = audioUri.startsWith('file://') ? audioUri.replace('file://', '') : audioUri;
        userContent.push({
          type: 'file',
          data: audioPath,
          mediaType: 'audio/wav',
        } as FilePart);
      }

      // Add text prompt
      userContent.push({
        type: 'text',
        text: prompt,
      } as TextPart);

      const messages: ModelMessage[] = [
        { role: 'system', content: 'You are a helpful AI assistant.' },
        { role: 'user', content: userContent },
      ];

      const result = await generate(messages);
      setResponse(result.text);
    } catch (e) {
      Alert.alert('Error', `Generation failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsGenerating(false);
    }
  }, [prompt, model, generate, imageUri, audioUri]);

  const handleStreamText = useCallback(async () => {
    if (!prompt.trim() || !model) return;

    // iOS doesn't support multimodal yet
    if (Platform.OS === 'ios' && (imageUri || audioUri)) {
      Alert.alert('Not Supported', 'Multimodal input is only supported on Android.');
      return;
    }

    setIsStreaming(true);
    setResponse('');

    try {
      // Build user content with multimodal parts
      const userContent: ContentPart[] = [];

      // Add image as ImagePart if present
      if (imageUri) {
        const imagePath = imageUri.startsWith('file://') ? imageUri.replace('file://', '') : imageUri;
        userContent.push({
          type: 'image',
          image: imagePath,
          mediaType: 'image/jpeg',
        } as ImagePart);
      }

      // Add audio as FilePart if present
      if (audioUri) {
        const audioPath = audioUri.startsWith('file://') ? audioUri.replace('file://', '') : audioUri;
        userContent.push({
          type: 'file',
          data: audioPath,
          mediaType: 'audio/wav',
        } as FilePart);
      }

      // Add text prompt
      userContent.push({
        type: 'text',
        text: prompt,
      } as TextPart);

      const messages: ModelMessage[] = [
        { role: 'system', content: 'You are a helpful AI assistant.' },
        { role: 'user', content: userContent },
      ];

      const result = await stream(messages);

      for await (const textPart of result.textStream) {
        setResponse((prev) => prev + textPart);
      }
    } catch (e) {
      Alert.alert('Error', `Streaming failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsStreaming(false);
    }
  }, [prompt, model, stream, imageUri, audioUri]);

  const handleCancel = useCallback(async () => {
    try {
      await cancel();
      setIsGenerating(false);
      setIsStreaming(false);
    } catch (e) {
      console.error('Cancel error:', e);
    }
  }, [cancel]);

  const handleUnloadModel = useCallback(async () => {
    try {
      await unloadModel();
      Alert.alert('Success', 'Model unloaded successfully');
    } catch (e) {
      Alert.alert('Error', `Failed to unload model: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [unloadModel]);

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
      setAudioUri(null);
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
      setResponse('');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Recording stop error:', message);
      Alert.alert('Recording Error', message);
      setIsRecording(false);
    }
  }, []);

  const handleClearAudio = useCallback(() => {
    setAudioUri(null);
    setAudioDuration(null);
  }, []);

  const getStatusText = () => {
    if (isLoading) return 'Loading model...';
    if (!isLoaded) return 'Model not loaded';
    if (isGenerating || isStreaming) return 'Generating...';
    return 'Model ready';
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        ref={scrollViewRef}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.title}>Standardized API Demo</Text>
          <Text style={styles.subtitle}>AI-SDK Compatible Interface</Text>
        </View>

        <View style={styles.statusContainer}>
          <Text style={styles.statusText}>{getStatusText()}</Text>
          {error && <Text style={styles.errorText}>{error}</Text>}
        </View>

        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.button, isLoaded && styles.disabledButton]}
            onPress={handleLoadModel}
            disabled={isLoaded}
          >
            <Text style={styles.buttonText}>Load Model</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, !isLoaded && styles.disabledButton]}
            onPress={handleUnloadModel}
            disabled={!isLoaded}
          >
            <Text style={styles.buttonText}>Unload Model</Text>
          </TouchableOpacity>
        </View>

        {/* Multimodal Input Section */}
        {Platform.OS === 'android' && isLoaded && (
          <View style={styles.multimodalSection}>
            <Text style={styles.sectionTitle}>Multimodal Input (Android)</Text>

            {/* Image Input */}
            <View style={styles.mediaRow}>
              <TouchableOpacity
                style={[styles.mediaButton, imageUri && styles.mediaButtonActive]}
                onPress={handlePickImage}
              >
                <Text style={styles.mediaButtonText}>
                  {imageUri ? '📷 Image Added' : '📷 Add Image'}
                </Text>
              </TouchableOpacity>
              {imageUri && (
                <TouchableOpacity style={styles.clearButton} onPress={handleClearImage}>
                  <Text style={styles.clearButtonText}>✕</Text>
                </TouchableOpacity>
              )}
            </View>

            {imageUri && (
              <Image source={{ uri: imageUri }} style={styles.imagePreview} resizeMode="cover" />
            )}

            {/* Audio Input */}
            <View style={styles.mediaRow}>
              <TouchableOpacity
                style={[
                  styles.mediaButton,
                  isRecording && styles.recordingButton,
                  audioUri && styles.mediaButtonActive,
                ]}
                onPress={isRecording ? handleStopRecording : handleStartRecording}
              >
                <Text style={styles.mediaButtonText}>
                  {isRecording ? '⏹ Stop Recording' : audioUri ? '🎤 Audio Recorded' : '🎤 Record Audio'}
                </Text>
              </TouchableOpacity>
              {audioUri && !isRecording && (
                <TouchableOpacity style={styles.clearButton} onPress={handleClearAudio}>
                  <Text style={styles.clearButtonText}>✕</Text>
                </TouchableOpacity>
              )}
            </View>
            {audioDuration !== null && (
              <Text style={styles.audioInfo}>Duration: {audioDuration.toFixed(1)}s</Text>
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
          editable={isLoaded}
          onFocus={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
        />

        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[
              styles.button,
              styles.primaryButton,
              (!isLoaded || isGenerating || isStreaming) && styles.disabledButton,
            ]}
            onPress={handleGenerateText}
            disabled={!isLoaded || isGenerating || isStreaming || !prompt.trim()}
          >
            {isGenerating ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Generate Text</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.button,
              styles.secondaryButton,
              (!isLoaded || isGenerating || isStreaming) && styles.disabledButton,
            ]}
            onPress={handleStreamText}
            disabled={!isLoaded || isGenerating || isStreaming || !prompt.trim()}
          >
            {isStreaming ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Stream Text</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.button,
              styles.dangerButton,
              !(isGenerating || isStreaming) && styles.disabledButton,
            ]}
            onPress={handleCancel}
            disabled={!isGenerating && !isStreaming}
          >
            <Text style={styles.buttonText}>Cancel</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.responseContainer}>
          <Text style={styles.responseText}>{response || 'Response will appear here...'}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
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
  errorText: {
    color: '#ff8a8a',
    fontSize: 13,
    marginTop: 8,
    textAlign: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 16,
    gap: 8,
  },
  button: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  disabledButton: {
    opacity: 0.5,
  },
  primaryButton: {
    backgroundColor: '#6C63FF',
    flex: 1,
  },
  secondaryButton: {
    backgroundColor: '#4CAF50',
    flex: 1,
  },
  dangerButton: {
    backgroundColor: '#e53935',
  },
  buttonText: {
    color: '#fff',
    fontSize: 14,
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
    marginBottom: 16,
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
});
