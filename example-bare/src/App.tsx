/**
 * Example app demonstrating react-native-llm-litert-mediapipe usage
 * with a downloadable Gemma 3n model
 */
import React, { useState, useCallback } from 'react';
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
} from 'react-native';

import { useLLM } from 'react-native-llm-litert-mediapipe';

// Gemma 3n E4B model URL (you'll need to provide your own URL or use HuggingFace)
const MODEL_URL = 'https://huggingface.co/example/gemma-3n-e4b/resolve/main/gemma-3n-e4b.task';
const MODEL_NAME = 'gemma-3n-e4b.task';

export default function App() {
  const [prompt, setPrompt] = useState('');
  const [response, setResponse] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  
  const {
    downloadModel,
    loadModel,
    generateStreamingResponse,
    isLoaded,
    downloadStatus,
    downloadProgress,
    downloadError,
    isCheckingStatus,
  } = useLLM({
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

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || !isLoaded) return;

    setIsGenerating(true);
    setResponse('');

    try {
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
    } finally {
      setIsGenerating(false);
    }
  }, [prompt, isLoaded, generateStreamingResponse]);

  const getStatusText = () => {
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
        
        {downloadStatus === 'downloading' && (
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${downloadProgress * 100}%` }]} />
          </View>
        )}
      </View>

      <View style={styles.buttonRow}>
        {downloadStatus === 'not_downloaded' && (
          <TouchableOpacity style={styles.button} onPress={handleDownload}>
            <Text style={styles.buttonText}>Download Model</Text>
          </TouchableOpacity>
        )}
        
        {downloadStatus === 'downloaded' && !isLoaded && (
          <TouchableOpacity style={styles.button} onPress={handleLoad}>
            <Text style={styles.buttonText}>Load Model</Text>
          </TouchableOpacity>
        )}
      </View>

      {isLoaded && (
        <>
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
            disabled={isGenerating || !prompt.trim()}
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
});
