import React, {useState, useCallback, useRef} from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Image,
  Animated,
  Platform,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';

import {createGoogleGenerativeAI} from '@ai-sdk/google';
import {generateText, streamText, Output} from 'ai';
import {launchImageLibrary, Asset} from 'react-native-image-picker';
import {z} from 'zod';
import {createOpenAI} from '@ai-sdk/openai';
import {fetch as streamingFetch} from 'react-native-fetch-api';
import Config from 'react-native-config';
import {OPENAI_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY} from '@env';
import {streamToAsyncGenerator} from 'react-native-llm-litert-mediapipe';

const SentimentSchema = z.object({
  sentiment: z.enum(['positive', 'negative', 'neutral']),
  confidence: z.number(),
  summary: z.string(),
  keywords: z.array(z.string()),
});

type SentimentResult = z.infer<typeof SentimentSchema>;
console.log('Using OpenAI API Key env:', OPENAI_API_KEY);

const google = createGoogleGenerativeAI({
  apiKey: GOOGLE_GENERATIVE_AI_API_KEY,
});

// Regular provider for generateText and generateObject
const openai = createOpenAI({
  apiKey: OPENAI_API_KEY,
});

// Streaming-enabled provider for streamText
const openaiStreaming = createOpenAI({
  apiKey: OPENAI_API_KEY,
  fetch: (url, options) =>
    streamingFetch(url, {...options, reactNative: {textStreaming: true}}),
});

const model = openai('gpt-4o-mini');
const streamingModel = openaiStreaming('gpt-4o-mini');

const THEME = {
  gradient: ['#f5e09aff', '#fcede9ff'],
  glassBg: 'rgba(255, 255, 255, 0.25)',
  glassBorder: 'rgba(255, 255, 255, 0.5)',
  textColor: '#2d3436',
  primaryColor: '#6c5ce7',
  secondaryColor: '#00cec9',
  oColor: '#e84393',
};

export default function GeminiApiDemo() {
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [showMultimodalSection, setShowMultimodalSection] = useState(false);

  const [showStructuredSection, setShowStructuredSection] = useState(false);
  const [structuredPrompt, setStructuredPrompt] = useState(
    'Analyze the sentiment of this text: "I absolutely love this new product! It has exceeded all my expectations and the customer service was fantastic."',
  );
  const [structuredResult, setStructuredResult] =
    useState<SentimentResult | null>(null);
  const [isGeneratingStructured, setIsGeneratingStructured] = useState(false);
  const scrollViewRef = useRef<ScrollView>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  const handleGenerateText = useCallback(async () => {
    if (!prompt.trim()) return;

    setIsGenerating(true);
    setResponse('');

    try {
      const content: any[] = [];

      if (imageUri) {
        content.push({
          type: 'image',
          image: imageUri,
        });
      }

      content.push({
        type: 'text',
        text: prompt,
      });

      const result = await generateText({
        model: model,
        messages: [
          {
            role: 'user',
            content,
          },
        ],
      });

      setResponse(result.text);
    } catch (error) {
      Alert.alert(
        'Error',
        `Generation failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      setIsGenerating(false);
    }
  }, [prompt, imageUri]);

  const handleStreamText = useCallback(async () => {
    if (!prompt.trim()) return;

    setIsStreaming(true);
    setResponse('');

    try {
      const content: any[] = [];

      if (imageUri) {
        content.push({
          type: 'image',
          image: imageUri,
        });
      }

      content.push({
        type: 'text',
        text: prompt,
      });

      const result = streamText({
        model: streamingModel,
        messages: [
          {
            role: 'user',
            content,
          },
        ],
      });

      // Use streamToAsyncGenerator to wrap the textStream for async iteration
      // This is needed because AI SDK's bundled code may not have Symbol.asyncIterator
      // properly set when running in React Native's Hermes engine
      for await (const textPart of streamToAsyncGenerator(result.textStream)) {
        setResponse(prev => prev + textPart);
      }
    } catch (error) {
      console.error('Streaming error:', error);
      Alert.alert(
        'Error',
        `Streaming failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      setIsStreaming(false);
    }
  }, [prompt, imageUri]);

  const handleCancel = useCallback(() => {
    setIsGenerating(false);
    setIsStreaming(false);
    setResponse('');
  }, []);

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
      const message = error instanceof Error ? error.message : String(error);
      Alert.alert('Image Picker Error', message);
    }
  }, []);

  const handleClearImage = useCallback(() => {
    setImageUri(null);
  }, []);

  const handleGenerateStructuredOutput = useCallback(async () => {
    if (!structuredPrompt.trim()) return;

    setIsGeneratingStructured(true);
    setStructuredResult(null);

    try {
      const result = await generateText({
        model: model,
        output: Output.object({
          schema: SentimentSchema,
        }),
        prompt: structuredPrompt,
      });

      setStructuredResult(result.output as SentimentResult);
      console.log('Structured output result:', result.output);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error('Structured output error:', errorMessage);
      Alert.alert('Error', `Structured output failed: ${errorMessage}`);
    } finally {
      setIsGeneratingStructured(false);
    }
  }, [structuredPrompt]);

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
            <Text style={styles.title}>AI-SDK Gemini</Text>
          </View>

          <TouchableOpacity
            style={[styles.glassCard, styles.collapsibleHeader]}
            onPress={() => setShowMultimodalSection(!showMultimodalSection)}>
            <View style={styles.collapsibleHeaderContent}>
              <Text style={styles.collapsibleTitle}>Multimodal Input</Text>
              {imageUri && (
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
                <View style={styles.mediaRow}>
                  <TouchableOpacity
                    style={[
                      styles.mediaButton,
                      imageUri && styles.mediaButtonActive,
                    ]}
                    onPress={handlePickImage}>
                    <Text style={styles.mediaIcon}>📷</Text>
                    <Text
                      style={[
                        styles.mediaButtonText,
                        {color: THEME.textColor},
                      ]}>
                      {imageUri ? 'Change' : 'Add Image'}
                    </Text>
                  </TouchableOpacity>
                  {imageUri && (
                    <TouchableOpacity
                      style={[
                        styles.removeButton,
                        {backgroundColor: THEME.oColor},
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
              </View>
            </View>
          )}

          <TouchableOpacity
            style={[styles.glassCard, styles.collapsibleHeader]}
            onPress={() => setShowStructuredSection(!showStructuredSection)}>
            <View style={styles.collapsibleHeaderContent}>
              <Text style={styles.collapsibleTitle}>Structured Output</Text>
              <Text style={styles.collapsibleSubtitle}>
                Generate JSON with Zod schema validation
              </Text>
            </View>
            <Text style={styles.collapsibleArrow}>
              {showStructuredSection ? '▼' : '▶'}
            </Text>
          </TouchableOpacity>

          {showStructuredSection && (
            <View style={styles.section}>
              <View style={[styles.glassCard, styles.structuredSection]}>
                <Text style={[styles.inputLabel, {color: THEME.textColor}]}>
                  Text to Analyze
                </Text>
                <TextInput
                  style={styles.structuredInput}
                  placeholder="Enter text for sentiment analysis..."
                  placeholderTextColor="#6b7280"
                  value={structuredPrompt}
                  onChangeText={setStructuredPrompt}
                  multiline
                />

                <View style={styles.schemaInfo}>
                  <Text style={styles.schemaLabel}>Output Schema:</Text>
                  <Text style={styles.schemaCode}>
                    {`{
  sentiment: 'positive' | 'negative' | 'neutral',
  confidence: number,
  summary: string,
  keywords: string[]
}`}
                  </Text>
                </View>

                <TouchableOpacity
                  style={[
                    styles.structuredButton,
                    {backgroundColor: '#9b59b6'},
                    (isGeneratingStructured || !structuredPrompt.trim()) &&
                      styles.generateButtonDisabled,
                  ]}
                  onPress={handleGenerateStructuredOutput}
                  disabled={isGeneratingStructured || !structuredPrompt.trim()}>
                  {isGeneratingStructured ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.generateButtonText}>
                      Generate Structured Output
                    </Text>
                  )}
                </TouchableOpacity>

                {structuredResult && (
                  <View style={styles.structuredResultCard}>
                    <Text style={styles.structuredResultTitle}>Result:</Text>
                    <View style={styles.resultRow}>
                      <Text style={styles.resultLabel}>Sentiment:</Text>
                      <Text
                        style={[
                          styles.resultValue,
                          styles.sentimentBadge,
                          {
                            backgroundColor:
                              structuredResult.sentiment === 'positive'
                                ? '#27ae60'
                                : structuredResult.sentiment === 'negative'
                                  ? '#e74c3c'
                                  : '#f39c12',
                          },
                        ]}>
                        {structuredResult.sentiment.toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.resultRow}>
                      <Text style={styles.resultLabel}>Confidence:</Text>
                      <Text style={styles.resultValue}>
                        {(structuredResult.confidence * 100).toFixed(1)}%
                      </Text>
                    </View>
                    <View style={styles.resultRow}>
                      <Text style={styles.resultLabel}>Summary:</Text>
                      <Text style={styles.resultValueText}>
                        {structuredResult.summary}
                      </Text>
                    </View>
                    <View style={styles.resultRow}>
                      <Text style={styles.resultLabel}>Keywords:</Text>
                      <View style={styles.keywordsContainer}>
                        {structuredResult.keywords.map((keyword, index) => (
                          <Text key={index} style={styles.keywordBadge}>
                            {keyword}
                          </Text>
                        ))}
                      </View>
                    </View>
                  </View>
                )}
              </View>
            </View>
          )}

          <Animated.View style={{opacity: fadeAnim}}>
            <View style={[styles.glassCard, styles.promptSection]}>
              <Text style={[styles.inputLabel, {color: THEME.textColor}]}>
                Prompt
              </Text>
              <TextInput
                style={styles.input}
                placeholder="Type your message here..."
                placeholderTextColor="#6b7280"
                value={prompt}
                onChangeText={setPrompt}
                multiline
                onFocus={() =>
                  scrollViewRef.current?.scrollToEnd({animated: true})
                }
              />
            </View>

            <View style={styles.buttonRow}>
              <TouchableOpacity
                style={[
                  styles.generateButton,
                  {backgroundColor: THEME.primaryColor},
                  (isGenerating || isStreaming || !prompt.trim()) &&
                    styles.generateButtonDisabled,
                ]}
                onPress={handleGenerateText}
                disabled={isGenerating || isStreaming || !prompt.trim()}>
                {isGenerating ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.generateButtonText}>Generate</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.streamButton,
                  {backgroundColor: THEME.secondaryColor},
                  (isGenerating || isStreaming || !prompt.trim()) &&
                    styles.generateButtonDisabled,
                ]}
                onPress={handleStreamText}
                disabled={isGenerating || isStreaming || !prompt.trim()}>
                {isStreaming ? (
                  <ActivityIndicator color="#f89393ff" />
                ) : (
                  <Text style={styles.generateButtonText}>Stream</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.cancelButton,
                  {backgroundColor: THEME.oColor},
                  !(isGenerating || isStreaming) && styles.cancelButtonDisabled,
                ]}
                onPress={handleCancel}
                disabled={!isGenerating && !isStreaming}>
                <Text style={styles.cancelButtonText}>Stop</Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.glassCard, styles.responseSection]}>
              <Text style={[styles.responseLabel, {color: THEME.textColor}]}>
                Response
              </Text>
              <View style={styles.responseCard}>
                <Text style={[styles.responseText, {color: THEME.textColor}]}>
                  {response || 'AI response will appear here...'}
                </Text>
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
  glassCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    shadowColor: 'rgba(31, 38, 135, 0.15)',
    shadowOffset: {width: 0, height: 8},
    shadowOpacity: 1,
    shadowRadius: 32,
    elevation: 8,
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
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    padding: 16,
    borderRadius: 12,
    fontSize: 16,
    minHeight: 120,
    textAlignVertical: 'top',
    color: THEME.textColor,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 16,
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
  collapsibleSubtitle: {
    fontSize: 12,
    color: '#636e72',
    marginTop: 2,
  },
  structuredSection: {
    padding: 20,
  },
  structuredInput: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    padding: 16,
    borderRadius: 12,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
    color: '#2d3436',
    marginBottom: 16,
  },
  schemaInfo: {
    backgroundColor: 'rgba(155, 89, 182, 0.1)',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
  },
  schemaLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9b59b6',
    marginBottom: 8,
  },
  schemaCode: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 11,
    color: '#2d3436',
    lineHeight: 18,
  },
  structuredButton: {
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
  },
  structuredResultCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
  },
  structuredResultTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2d3436',
    marginBottom: 12,
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  resultLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#636e72',
    width: 90,
  },
  resultValue: {
    fontSize: 13,
    color: '#2d3436',
    flex: 1,
  },
  resultValueText: {
    fontSize: 13,
    color: '#2d3436',
    flex: 1,
    lineHeight: 18,
  },
  sentimentBadge: {
    color: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    fontSize: 11,
    fontWeight: '700',
    overflow: 'hidden',
  },
  keywordsContainer: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  keywordBadge: {
    backgroundColor: 'rgba(108, 92, 231, 0.2)',
    color: '#6c5ce7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    fontSize: 11,
    fontWeight: '600',
  },
});
