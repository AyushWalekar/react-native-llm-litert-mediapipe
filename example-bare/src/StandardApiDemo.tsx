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
  Animated,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';

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

const THEME = {
  gradient: ['#f5e09aff', '#fcede9ff'],
  glassBg: 'rgba(255, 255, 255, 0.25)',
  glassBorder: 'rgba(255, 255, 255, 0.5)',
  textColor: '#2d3436',
  primaryColor: '#6c5ce7',
  secondaryColor: '#00cec9',
  oColor: '#e84393',
};

const PRESET_MODEL_PATH = Platform.OS === 'android'
  ? `${RNFS.DocumentDirectoryPath}/litert/gemma-3n-E4B-it-int4.litertlm`
  : '';

export default function StandardApiDemo() {
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [audioDuration, setAudioDuration] = useState<number | null>(null);
  const [showMultimodalSection, setShowMultimodalSection] = useState(false);

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
  const fadeAnim = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (isLoaded) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }).start();
    }
  }, [isLoaded, fadeAnim]);

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

    if (Platform.OS === 'ios' && (imageUri || audioUri)) {
      Alert.alert('Not Supported', 'Multimodal input is only supported on Android.');
      return;
    }

    setIsGenerating(true);
    setResponse('');

    try {
      const userContent: ContentPart[] = [];

      if (imageUri) {
        const imagePath = imageUri.startsWith('file://') ? imageUri.replace('file://', '') : imageUri;
        userContent.push({
          type: 'image',
          image: imagePath,
          mediaType: 'image/jpeg',
        } as ImagePart);
      }

      if (audioUri) {
        const audioPath = audioUri.startsWith('file://') ? audioUri.replace('file://', '') : audioUri;
        userContent.push({
          type: 'file',
          data: audioPath,
          mediaType: 'audio/wav',
        } as FilePart);
      }

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

    if (Platform.OS === 'ios' && (imageUri || audioUri)) {
      Alert.alert('Not Supported', 'Multimodal input is only supported on Android.');
      return;
    }

    setIsStreaming(true);
    setResponse('');

    try {
      const userContent: ContentPart[] = [];

      if (imageUri) {
        const imagePath = imageUri.startsWith('file://') ? imageUri.replace('file://', '') : imageUri;
        userContent.push({
          type: 'image',
          image: imagePath,
          mediaType: 'image/jpeg',
        } as ImagePart);
      }

      if (audioUri) {
        const audioPath = audioUri.startsWith('file://') ? audioUri.replace('file://', '') : audioUri;
        userContent.push({
          type: 'file',
          data: audioPath,
          mediaType: 'audio/wav',
        } as FilePart);
      }

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
        setResponse('');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      Alert.alert('Image Picker Error', message);
    }
  }, []);

  const handleClearImage = useCallback(() => {
    setImageUri(null);
  }, []);

  const handleStartRecording = useCallback(async () => {
    try {
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

  const getStatusColor = () => {
    if (isLoaded) return THEME.secondaryColor;
    if (isLoading) return THEME.primaryColor;
    if (error) return THEME.oColor;
    return '#f39c12';
  };

  return (
    <LinearGradient colors={THEME.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.title}>AI-SDK Gemma-3n</Text>
          </View>

          {/* <View style={[styles.glassCard, styles.statusCard]}> */}
            {/* <View style={[styles.statusIndicator, { backgroundColor: getStatusColor() }]} /> */}
            {/* <Text style={styles.statusText}>{getStatusText()}</Text> */}
            {error && <Text style={styles.errorText}>{error}</Text>}
          {/* </View> */}

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[isLoaded ? styles.outlineButton : styles.primaryButton]}
              onPress={handleLoadModel}
              disabled={isLoaded}
            >
              <Text style={isLoaded ? styles.outlineButtonText : styles.primaryButtonText}>Load Model</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[isLoaded ? styles.primaryButton : styles.disabledButton]}
              onPress={handleUnloadModel}
              disabled={!isLoaded}
            >
              <Text style={isLoaded ? styles.primaryButtonText : styles.disabledButtonText}>Unload Model</Text>
            </TouchableOpacity>
          </View>

          {Platform.OS === 'android' && isLoaded && (
            <>
              <TouchableOpacity
                style={[styles.glassCard, styles.collapsibleHeader]}
                onPress={() => setShowMultimodalSection(!showMultimodalSection)}
              >
                <View style={styles.collapsibleHeaderContent}>
                  <Text style={styles.collapsibleTitle}>Multimodal Input</Text>
                  {(imageUri || audioUri) && (
                    <Text style={[styles.collapsibleStatus, { color: THEME.secondaryColor }]}>Active</Text>
                  )}
                </View>
                <Text style={styles.collapsibleArrow}>{showMultimodalSection ? '▼' : '▶'}</Text>
              </TouchableOpacity>

              {showMultimodalSection && (
                <View style={styles.section}>
                  <View style={[styles.glassCard, styles.mediaSection]}>
                    <View style={styles.mediaRow}>
                      <TouchableOpacity
                        style={[styles.mediaButton, imageUri && styles.mediaButtonActive]}
                        onPress={handlePickImage}
                      >
                        <Text style={styles.mediaIcon}>📷</Text>
                        <Text style={[styles.mediaButtonText, { color: THEME.textColor }]}>
                          {imageUri ? 'Change' : 'Add Image'}
                        </Text>
                      </TouchableOpacity>
                      {imageUri && (
                        <TouchableOpacity style={[styles.removeButton, { backgroundColor: THEME.oColor }]} onPress={handleClearImage}>
                          <Text style={styles.removeButtonText}>✕</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    {imageUri && (
                      <Image source={{ uri: imageUri }} style={styles.imagePreview} resizeMode="cover" />
                    )}

                    <View style={styles.mediaRow}>
                      <TouchableOpacity
                        style={[
                          styles.mediaButton,
                          isRecording && styles.recordingButton,
                          audioUri && styles.mediaButtonActive,
                        ]}
                        onPress={isRecording ? handleStopRecording : handleStartRecording}
                      >
                        <Text style={styles.mediaIcon}>🎤</Text>
                        <Text style={[styles.mediaButtonText, { color: THEME.textColor }]}>
                          {isRecording ? 'Stop' : audioUri ? 'Re-record' : 'Record'}
                        </Text>
                      </TouchableOpacity>
                      {audioUri && !isRecording && (
                        <TouchableOpacity style={[styles.removeButton, { backgroundColor: THEME.oColor }]} onPress={handleClearAudio}>
                          <Text style={styles.removeButtonText}>✕</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    {audioDuration !== null && (
                      <Text style={[styles.audioInfo, { color: THEME.textColor }]}>Duration: {audioDuration.toFixed(1)}s</Text>
                    )}
                  </View>
                </View>
              )}
            </>
          )}

          <Animated.View style={{ opacity: fadeAnim }}>
            <View style={[styles.glassCard, styles.promptSection]}>
              <Text style={[styles.inputLabel, { color: THEME.textColor }]}>Prompt</Text>
              <TextInput
                style={styles.input}
                placeholder="Type your message here..."
                placeholderTextColor="#6b7280"
                value={prompt}
                onChangeText={setPrompt}
                multiline
                editable={isLoaded}
                onFocus={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
              />
            </View>

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[
                  styles.generateButton,
                  { backgroundColor: THEME.primaryColor },
                  (!isLoaded || isGenerating || isStreaming || !prompt.trim()) && styles.generateButtonDisabled,
                ]}
                onPress={handleGenerateText}
                disabled={!isLoaded || isGenerating || isStreaming || !prompt.trim()}
              >
                {isGenerating ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.generateButtonText}>Generate</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.streamButton,
                  { backgroundColor: THEME.secondaryColor },
                  (!isLoaded || isGenerating || isStreaming || !prompt.trim()) && styles.generateButtonDisabled,
                ]}
                onPress={handleStreamText}
                disabled={!isLoaded || isGenerating || isStreaming || !prompt.trim()}
              >
                {isStreaming ? (
                  <ActivityIndicator color="#f89393ff" />
                ) : (
                  <Text style={styles.generateButtonText}>Stream</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.cancelButton,
                  { backgroundColor: THEME.oColor },
                  !(isGenerating || isStreaming) && styles.cancelButtonDisabled,
                ]}
                onPress={handleCancel}
                disabled={!isGenerating && !isStreaming}
              >
                <Text style={styles.cancelButtonText}>Stop</Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.glassCard, styles.responseSection]}>
              <Text style={[styles.responseLabel, { color: THEME.textColor }]}>Response</Text>
              <View style={styles.responseCard}>
                <Text style={[styles.responseText, { color: THEME.textColor }]}>{response || 'AI response will appear here...'}</Text>
              </View>
            </View>
          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 24,
    paddingTop: 12,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#2d3436',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    color: '#636e72',
    marginTop: 6,
  },
  glassCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    shadowColor: 'rgba(31, 38, 135, 0.15)',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 32,
    elevation: 8,
  },
  statusCard: {
    padding: 20,
    marginBottom: 16,
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginBottom: 12,
  },
  statusText: {
    color: '#2d3436',
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 6,
  },
  errorText: {
    color: '#e84393',
    fontSize: 14,
    marginTop: 12,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 16,
  },
  primaryButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  outlineButton: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(0, 0, 0, 0.1)',
  },
  outlineButtonText: {
    color: '#636e72',
    fontSize: 16,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.4,
  },
  disabledButtonText: {
    color: '#636e72',
    fontSize: 16,
    fontWeight: '600',
  },
  collapsibleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    marginBottom: 12,
  },
  collapsibleHeaderContent: {
    flex: 1,
  },
  collapsibleTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2d3436',
    marginBottom: 4,
  },
  collapsibleStatus: {
    fontSize: 13,
  },
  collapsibleArrow: {
    fontSize: 14,
    color: '#636e72',
    marginLeft: 12,
  },
  section: {
    marginBottom: 8,
  },
  mediaSection: {
    padding: 20,
  },
  mediaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  mediaButton: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  mediaButtonActive: {
    backgroundColor: 'rgba(0, 206, 201, 0.3)',
    borderColor: '#00cec9',
  },
  recordingButton: {
    backgroundColor: 'rgba(232, 67, 147, 0.3)',
    borderColor: '#e84393',
  },
  mediaIcon: {
    fontSize: 18,
  },
  mediaButtonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  removeButton: {
    marginLeft: 12,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  imagePreview: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    marginBottom: 12,
  },
  audioInfo: {
    fontSize: 13,
    textAlign: 'center',
    marginTop: 8,
  },
  promptSection: {
    padding: 20,
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  input: {
    // backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    padding: 16,
    borderRadius: 12,
    fontSize: 16,
    minHeight: 120,
    textAlignVertical: 'top',
    color: THEME.textColor,
  },
  generateButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  generateButtonDisabled: {
    opacity: 0.4,
  },
  generateButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  streamButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  cancelButton: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 14,
    alignItems: 'center',
  },
  cancelButtonDisabled: {
    opacity: 0.4,
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  responseSection: {
    padding: 20,
  },
  responseLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 12,
  },
  responseCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 12,
    padding: 16,
    minHeight: 140,
  },
  responseText: {
    fontSize: 15,
    lineHeight: 24,
  },
});
