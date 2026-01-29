/**
 * Example demonstrating the AI SDK Custom Provider for on-device LLM inference
 *
 * This demo shows how to use the MediaPipe LLM provider with the standard AI SDK
 * interface (generateText, streamText), enabling seamless switching between
 * cloud providers (OpenAI, Google) and on-device models.
 *
 * Features demonstrated:
 * - AI SDK compatible interface with createMediaPipeLlm
 * - Lazy model loading with optional preloading
 * - Multimodal input (images, audio) on Android
 * - Structured output with Zod schemas
 * - Streaming text generation
 */
import React, {useState, useCallback, useRef, useEffect} from 'react';
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
import LinearGradient from 'react-native-linear-gradient';

// AI SDK imports - same as cloud providers!
import {generateText, streamText, Output} from 'ai';
import {z} from 'zod';
import RNFS from 'react-native-fs';

// On-device provider from our library
// Note: When using as a published package, import from 'react-native-llm-litert-mediapipe/ai-sdk'
import {createMediaPipeLlm, noopDownload} from 'react-native-llm-litert-mediapipe';
import type {
  ContentPart,
  TextPart,
  ImagePart,
  FilePart,
} from 'react-native-llm-litert-mediapipe';

import {launchImageLibrary, Asset} from 'react-native-image-picker';
import * as AudioRecorder from './AudioRecorderJS';

// Define the sentiment analysis schema (same as cloud demo)
const SentimentSchema = z.object({
  sentiment: z.enum(['positive', 'negative', 'neutral']),
  confidence: z.number(),
  summary: z.string(),
  keywords: z.array(z.string()),
});

type SentimentResult = z.infer<typeof SentimentSchema>;

const THEME = {
  gradient: ['#e8f5e9', '#c8e6c9'], // Green gradient for on-device
  glassBg: 'rgba(255, 255, 255, 0.25)',
  glassBorder: 'rgba(255, 255, 255, 0.5)',
  textColor: '#2d3436',
  primaryColor: '#43a047', // Green for on-device
  secondaryColor: '#00cec9',
  errorColor: '#e84393',
};

// Model path for Android
const PRESET_MODEL_PATH =
  Platform.OS === 'android'
    ? `${RNFS.DocumentDirectoryPath}/litert/gemma-3n-E4B-it-int4.litertlm`
    : '';

export default function AiSdkProviderDemo() {
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isModelLoading, setIsModelLoading] = useState(false);
  const [isModelLoaded, setIsModelLoaded] = useState(false);

  // Multimodal state
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [audioDuration, setAudioDuration] = useState<number | null>(null);
  const [showMultimodalSection, setShowMultimodalSection] = useState(false);

  // Structured output state
  const [showStructuredSection, setShowStructuredSection] = useState(false);
  const [structuredPrompt, setStructuredPrompt] = useState(
    'Analyze the sentiment of this text: "I absolutely love this new product! It has exceeded all my expectations and the customer service was fantastic."',
  );
  const [structuredResult, setStructuredResult] =
    useState<SentimentResult | null>(null);
  const [isGeneratingStructured, setIsGeneratingStructured] = useState(false);

  const scrollViewRef = useRef<ScrollView>(null);

  // Create the AI SDK provider with our on-device model
  // This uses lazy loading by default - model loads on first generation
  const mediapipeProvider = useRef(
    createMediaPipeLlm({
      modelPath: PRESET_MODEL_PATH,
      config: {
        maxTokens: 1024,
        topK: 40,
        temperature: 0.8,
        randomSeed: 42,
        enableVisionModality: Platform.OS === 'android',
        enableAudioModality: Platform.OS === 'android',
      },
    }),
  ).current;

  // Get the model instance - same pattern as cloud providers!
  const model = mediapipeProvider('gemma-3n');

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      mediapipeProvider.releaseAll().catch(console.error);
    };
  }, [mediapipeProvider]);

  /**
   * Preload the model for faster first inference
   * This is optional - models load lazily by default
   */
  const handlePreloadModel = useCallback(async () => {
    if (isModelLoaded) return;

    setIsModelLoading(true);
    try {
      await mediapipeProvider.preload();
      setIsModelLoaded(true);
      Alert.alert('Success', 'Model preloaded successfully');
    } catch (error) {
      Alert.alert(
        'Error',
        `Failed to preload model: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setIsModelLoading(false);
    }
  }, [isModelLoaded, mediapipeProvider]);

  /**
   * Release model to free memory
   */
  const handleReleaseModel = useCallback(async () => {
    try {
      await mediapipeProvider.releaseAll();
      setIsModelLoaded(false);
      Alert.alert('Success', 'Model released successfully');
    } catch (error) {
      Alert.alert(
        'Error',
        `Failed to release model: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }, [mediapipeProvider]);

  /**
   * Generate text using AI SDK interface - identical to cloud usage!
   */
  const handleGenerateText = useCallback(async () => {
    if (!prompt.trim()) return;

    if (Platform.OS === 'ios' && (imageUri || audioUri)) {
      Alert.alert(
        'Not Supported',
        'Multimodal input is only supported on Android.',
      );
      return;
    }

    setIsGenerating(true);
    setResponse('');

    try {
      // Build content array - same format as cloud providers
      const content: ContentPart[] = [];

      if (imageUri) {
        const imagePath = imageUri.startsWith('file://')
          ? imageUri.replace('file://', '')
          : imageUri;
        content.push({
          type: 'image',
          image: imagePath,
          mediaType: 'image/jpeg',
        } as ImagePart);
      }

      if (audioUri) {
        const audioPath = audioUri.startsWith('file://')
          ? audioUri.replace('file://', '')
          : audioUri;
        content.push({
          type: 'file',
          data: audioPath,
          mediaType: 'audio/wav',
        } as FilePart);
      }

      content.push({
        type: 'text',
        text: prompt,
      } as TextPart);

      // Use AI SDK generateText - same API as OpenAI/Google!
      // Cast to any to handle type differences between library version and AI SDK
      // Use noopDownload to prevent AI SDK from trying to fetch local file:// URLs
      const result = await generateText({
        model: model as any,
        messages: [
          {role: 'system', content: 'You are a helpful AI assistant.'},
          {role: 'user', content: content as any},
        ],
        experimental_download: noopDownload,
      });

      setResponse(result.text);
      setIsModelLoaded(true); // Model loaded during generation
    } catch (error) {
      Alert.alert(
        'Error',
        `Generation failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setIsGenerating(false);
    }
  }, [prompt, model, imageUri, audioUri]);

  /**
   * Stream text using AI SDK interface - identical to cloud usage!
   */
  const handleStreamText = useCallback(async () => {
    if (!prompt.trim()) return;

    if (Platform.OS === 'ios' && (imageUri || audioUri)) {
      Alert.alert(
        'Not Supported',
        'Multimodal input is only supported on Android.',
      );
      return;
    }

    setIsStreaming(true);
    setResponse('');

    try {
      // Build content array
      const content: ContentPart[] = [];

      if (imageUri) {
        const imagePath = imageUri.startsWith('file://')
          ? imageUri.replace('file://', '')
          : imageUri;
        content.push({
          type: 'image',
          image: imagePath,
          mediaType: 'image/jpeg',
        } as ImagePart);
      }

      if (audioUri) {
        const audioPath = audioUri.startsWith('file://')
          ? audioUri.replace('file://', '')
          : audioUri;
        content.push({
          type: 'file',
          data: audioPath,
          mediaType: 'audio/wav',
        } as FilePart);
      }

      content.push({
        type: 'text',
        text: prompt,
      } as TextPart);

      // Use AI SDK streamText - same API as OpenAI/Google!
      // Cast to any to handle type differences between library version and AI SDK
      // Use noopDownload to prevent AI SDK from trying to fetch local file:// URLs
      const result = streamText({
        model: model as any,
        messages: [
          {role: 'system', content: 'You are a helpful AI assistant.'},
          {role: 'user', content: content as any},
        ],
        experimental_download: noopDownload,
      });

      // Iterate over stream - same as cloud providers
      for await (const textPart of result.textStream) {
        setResponse(prev => prev + textPart);
      }

      setIsModelLoaded(true);
    } catch (error) {
      Alert.alert(
        'Error',
        `Streaming failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setIsStreaming(false);
    }
  }, [prompt, model, imageUri, audioUri]);

  /**
   * Generate structured output using AI SDK Output.object
   */
  const handleGenerateStructuredOutput = useCallback(async () => {
    if (!structuredPrompt.trim()) return;

    if (Platform.OS === 'ios') {
      Alert.alert(
        'Not Supported',
        'Structured output is only supported on Android with LiteRT-LM models.',
      );
      return;
    }

    setIsGeneratingStructured(true);
    setStructuredResult(null);

    try {
      // Use AI SDK generateText with Output.object - same as cloud!
      // Cast to any to handle type differences between library version and AI SDK
      const result = await generateText({
        model: model as any,
        output: Output.object({
          schema: SentimentSchema,
        }),
        prompt: structuredPrompt,
        experimental_download: noopDownload,
      });

      setStructuredResult(result.output as SentimentResult);
      setIsModelLoaded(true);
      console.log('Structured output result:', result.output);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error('Structured output error:', errorMessage);
      Alert.alert('Error', `Structured output failed: ${errorMessage}`);
    } finally {
      setIsGeneratingStructured(false);
    }
  }, [structuredPrompt, model]);

  const handleCancel = useCallback(() => {
    setIsGenerating(false);
    setIsStreaming(false);
    setResponse('');
  }, []);

  // Image picker
  const handlePickImage = useCallback(async () => {
    try {
      const result = await launchImageLibrary({
        mediaType: 'photo',
        quality: 0.8,
        selectionLimit: 1,
      });

      if (result.didCancel) return;
      if (result.errorCode) {
        Alert.alert(
          'Image Picker Error',
          result.errorMessage || 'Unknown error',
        );
        return;
      }

      const selectedAsset: Asset | undefined = result.assets?.[0];
      if (selectedAsset?.uri) {
        setImageUri(selectedAsset.uri);
        setResponse('');
      }
    } catch (error) {
      Alert.alert(
        'Image Picker Error',
        error instanceof Error ? error.message : String(error),
      );
    }
  }, []);

  const handleClearImage = useCallback(() => {
    setImageUri(null);
  }, []);

  // Audio recording
  const handleStartRecording = useCallback(async () => {
    try {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
          {
            title: 'Audio Recording Permission',
            message:
              'This app needs access to your microphone to record audio.',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          },
        );
        if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
          Alert.alert(
            'Permission Denied',
            'Audio recording permission is required.',
          );
          return;
        }
      }

      await AudioRecorder.startRecording();
      setIsRecording(true);
      setAudioUri(null);
      setAudioDuration(null);
    } catch (error) {
      Alert.alert(
        'Recording Error',
        error instanceof Error ? error.message : String(error),
      );
    }
  }, []);

  const handleStopRecording = useCallback(async () => {
    try {
      const result = await AudioRecorder.stopRecording();
      setAudioUri(result.path);
      setAudioDuration(result.duration);
      setIsRecording(false);
      setResponse('');
    } catch (error) {
      Alert.alert(
        'Recording Error',
        error instanceof Error ? error.message : String(error),
      );
      setIsRecording(false);
    }
  }, []);

  const handleClearAudio = useCallback(() => {
    setAudioUri(null);
    setAudioDuration(null);
  }, []);

  return (
    <LinearGradient
      colors={THEME.gradient}
      start={{x: 0, y: 0}}
      end={{x: 1, y: 1}}
      style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          ref={scrollViewRef}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.title}>🔌 AI SDK Provider</Text>
            <Text style={styles.subtitle}>On-Device Gemma 3n</Text>
          </View>

          {/* Model Control */}
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[
                isModelLoaded ? styles.outlineButton : styles.primaryButton,
              ]}
              onPress={handlePreloadModel}
              disabled={isModelLoaded || isModelLoading}>
              {isModelLoading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text
                  style={
                    isModelLoaded
                      ? styles.outlineButtonText
                      : styles.primaryButtonText
                  }>
                  Preload Model
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                isModelLoaded ? styles.primaryButton : styles.disabledButton,
              ]}
              onPress={handleReleaseModel}
              disabled={!isModelLoaded}>
              <Text
                style={
                  isModelLoaded
                    ? styles.primaryButtonText
                    : styles.disabledButtonText
                }>
                Release Model
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.infoText}>
            💡 Model loads lazily on first generation. Use "Preload" for faster
            first response.
          </Text>

          {/* Multimodal Section - Android only */}
          {Platform.OS === 'android' && (
            <>
              <TouchableOpacity
                style={[styles.glassCard, styles.collapsibleHeader]}
                onPress={() =>
                  setShowMultimodalSection(!showMultimodalSection)
                }>
                <View style={styles.collapsibleHeaderContent}>
                  <Text style={styles.collapsibleTitle}>Multimodal Input</Text>
                  {(imageUri || audioUri) && (
                    <Text
                      style={[
                        styles.collapsibleStatus,
                        {color: THEME.secondaryColor},
                      ]}>
                      Active
                    </Text>
                  )}
                </View>
                <Text style={styles.collapsibleArrow}>
                  {showMultimodalSection ? '▼' : '▶'}
                </Text>
              </TouchableOpacity>

              {showMultimodalSection && (
                <View style={styles.section}>
                  <View style={[styles.glassCard, styles.mediaSection]}>
                    {/* Image picker */}
                    <View style={styles.mediaRow}>
                      <TouchableOpacity
                        style={[
                          styles.mediaButton,
                          imageUri && styles.mediaButtonActive,
                        ]}
                        onPress={handlePickImage}>
                        <Text style={styles.mediaIcon}>📷</Text>
                        <Text style={styles.mediaButtonText}>
                          {imageUri ? 'Change' : 'Add Image'}
                        </Text>
                      </TouchableOpacity>
                      {imageUri && (
                        <TouchableOpacity
                          style={[
                            styles.removeButton,
                            {backgroundColor: THEME.errorColor},
                          ]}
                          onPress={handleClearImage}>
                          <Text style={styles.removeButtonText}>✕</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    {imageUri && (
                      <Image
                        source={{uri: imageUri}}
                        style={styles.imagePreview}
                        resizeMode="cover"
                      />
                    )}

                    {/* Audio recorder */}
                    <View style={styles.mediaRow}>
                      <TouchableOpacity
                        style={[
                          styles.mediaButton,
                          isRecording && styles.recordingButton,
                          audioUri && styles.mediaButtonActive,
                        ]}
                        onPress={
                          isRecording
                            ? handleStopRecording
                            : handleStartRecording
                        }>
                        <Text style={styles.mediaIcon}>🎤</Text>
                        <Text style={styles.mediaButtonText}>
                          {isRecording
                            ? 'Stop'
                            : audioUri
                              ? 'Re-record'
                              : 'Record'}
                        </Text>
                      </TouchableOpacity>
                      {audioUri && !isRecording && (
                        <TouchableOpacity
                          style={[
                            styles.removeButton,
                            {backgroundColor: THEME.errorColor},
                          ]}
                          onPress={handleClearAudio}>
                          <Text style={styles.removeButtonText}>✕</Text>
                        </TouchableOpacity>
                      )}
                    </View>

                    {audioDuration !== null && (
                      <Text style={styles.audioInfo}>
                        Duration: {audioDuration.toFixed(1)}s
                      </Text>
                    )}
                  </View>
                </View>
              )}
            </>
          )}

          {/* Structured Output Section - Android only */}
          {Platform.OS === 'android' && (
            <>
              <TouchableOpacity
                style={[styles.glassCard, styles.collapsibleHeader]}
                onPress={() =>
                  setShowStructuredSection(!showStructuredSection)
                }>
                <View style={styles.collapsibleHeaderContent}>
                  <Text style={styles.collapsibleTitle}>Structured Output</Text>
                  {structuredResult && (
                    <Text
                      style={[
                        styles.collapsibleStatus,
                        {color: THEME.secondaryColor},
                      ]}>
                      ✓
                    </Text>
                  )}
                </View>
                <Text style={styles.collapsibleArrow}>
                  {showStructuredSection ? '▼' : '▶'}
                </Text>
              </TouchableOpacity>

              {showStructuredSection && (
                <View style={styles.section}>
                  <View style={styles.glassCard}>
                    <Text style={styles.sectionTitle}>
                      Sentiment Analysis (Zod Schema)
                    </Text>
                    <TextInput
                      style={styles.structuredInput}
                      placeholder="Enter text to analyze..."
                      value={structuredPrompt}
                      onChangeText={setStructuredPrompt}
                      multiline
                      numberOfLines={3}
                    />
                    <TouchableOpacity
                      style={[
                        styles.primaryButton,
                        isGeneratingStructured && styles.disabledButton,
                      ]}
                      onPress={handleGenerateStructuredOutput}
                      disabled={isGeneratingStructured}>
                      {isGeneratingStructured ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.primaryButtonText}>
                          Analyze Sentiment
                        </Text>
                      )}
                    </TouchableOpacity>

                    {structuredResult && (
                      <View style={styles.structuredResult}>
                        <Text style={styles.resultLabel}>Result:</Text>
                        <Text style={styles.resultText}>
                          Sentiment: {structuredResult.sentiment}
                        </Text>
                        <Text style={styles.resultText}>
                          Confidence:{' '}
                          {(structuredResult.confidence * 100).toFixed(1)}%
                        </Text>
                        <Text style={styles.resultText}>
                          Summary: {structuredResult.summary}
                        </Text>
                        <Text style={styles.resultText}>
                          Keywords: {structuredResult.keywords.join(', ')}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              )}
            </>
          )}

          {/* Text Generation */}
          <View style={styles.section}>
            <View style={styles.glassCard}>
              <Text style={styles.sectionTitle}>Text Generation</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your prompt..."
                value={prompt}
                onChangeText={setPrompt}
                multiline
                numberOfLines={3}
              />

              <View style={styles.buttonRow}>
                <TouchableOpacity
                  style={[
                    styles.primaryButton,
                    (isGenerating || isStreaming) && styles.disabledButton,
                  ]}
                  onPress={handleGenerateText}
                  disabled={isGenerating || isStreaming || !prompt.trim()}>
                  {isGenerating ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Generate</Text>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.primaryButton,
                    (isGenerating || isStreaming) && styles.disabledButton,
                  ]}
                  onPress={handleStreamText}
                  disabled={isGenerating || isStreaming || !prompt.trim()}>
                  {isStreaming ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.primaryButtonText}>Stream</Text>
                  )}
                </TouchableOpacity>

                {(isGenerating || isStreaming) && (
                  <TouchableOpacity
                    style={styles.cancelButton}
                    onPress={handleCancel}>
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>

          {/* Response */}
          {response !== '' && (
            <View style={styles.section}>
              <View style={styles.glassCard}>
                <Text style={styles.sectionTitle}>Response</Text>
                <Text style={styles.responseText}>{response}</Text>
              </View>
            </View>
          )}
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
    padding: 16,
    paddingBottom: 32,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: THEME.textColor,
  },
  subtitle: {
    fontSize: 14,
    color: THEME.primaryColor,
    marginTop: 4,
  },
  infoText: {
    fontSize: 12,
    color: THEME.textColor,
    opacity: 0.7,
    textAlign: 'center',
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: THEME.textColor,
    marginBottom: 12,
  },
  glassCard: {
    backgroundColor: THEME.glassBg,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: THEME.glassBorder,
  },
  collapsibleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  collapsibleHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  collapsibleTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: THEME.textColor,
  },
  collapsibleStatus: {
    fontSize: 12,
    fontWeight: '500',
  },
  collapsibleArrow: {
    fontSize: 12,
    color: THEME.textColor,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: THEME.primaryColor,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  outlineButton: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: THEME.primaryColor,
  },
  outlineButtonText: {
    color: THEME.primaryColor,
    fontWeight: '600',
    fontSize: 14,
  },
  disabledButton: {
    flex: 1,
    backgroundColor: '#ccc',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  disabledButtonText: {
    color: '#888',
    fontWeight: '600',
    fontSize: 14,
  },
  cancelButton: {
    backgroundColor: THEME.errorColor,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: THEME.textColor,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  structuredInput: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: THEME.textColor,
    minHeight: 60,
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  responseText: {
    fontSize: 14,
    color: THEME.textColor,
    lineHeight: 22,
  },
  mediaSection: {
    gap: 12,
  },
  mediaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  mediaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    gap: 8,
  },
  mediaButtonActive: {
    backgroundColor: '#e8f5e9',
    borderWidth: 1,
    borderColor: THEME.primaryColor,
  },
  recordingButton: {
    backgroundColor: '#ffebee',
    borderWidth: 1,
    borderColor: THEME.errorColor,
  },
  mediaIcon: {
    fontSize: 20,
  },
  mediaButtonText: {
    fontSize: 14,
    color: THEME.textColor,
  },
  removeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  imagePreview: {
    width: '100%',
    height: 150,
    borderRadius: 12,
  },
  audioInfo: {
    fontSize: 12,
    color: THEME.textColor,
    opacity: 0.7,
  },
  structuredResult: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
  },
  resultLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: THEME.textColor,
    marginBottom: 8,
  },
  resultText: {
    fontSize: 13,
    color: THEME.textColor,
    marginBottom: 4,
  },
});
