/**
 * Example demonstrating new standardized LLM API
 * AI-SDK compatible interface with ModelMessage format
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
} from 'react-native';

import {
  useStandardLLM,
  generateText,
  streamText,
  type ModelMessage,
  type TextPart,
  type ImagePart,
} from 'react-native-llm-litert-mediapipe';

const PRESET_MODEL_PATH = Platform.OS === 'android'
  ? '/data/user/0/com.mediapipellmexample/files/16f676c9-6155-462a-a8bf-59247fc4c07b/gemma-3n-E4B-it-int4.task'
  : '';

export default function StandardApiDemo() {
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);

  const standardLlm = useStandardLLM({
    type: 'file',
    path: PRESET_MODEL_PATH,
    config: {
      maxTokens: 1024,
      topK: 40,
      temperature: 0.8,
      randomSeed: 42,
      enableVisionModality: true,
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

    setIsGenerating(true);
    setResponse('');

    try {
      const messages: ModelMessage[] = [
        { role: 'system', content: 'You are a helpful AI assistant.' },
        { role: 'user', content: prompt },
      ];

      const result = await generate(messages);
      setResponse(result.text);
    } catch (e) {
      Alert.alert('Error', `Generation failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsGenerating(false);
    }
  }, [prompt, model, generate]);

  const handleStreamText = useCallback(async () => {
    if (!prompt.trim() || !model) return;

    setIsStreaming(true);
    setResponse('');

    try {
      const messages: ModelMessage[] = [
        { role: 'system', content: 'You are a helpful AI assistant.' },
        { role: 'user', content: prompt },
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
  }, [prompt, model, stream]);

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
});
