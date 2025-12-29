/**
 * Example app demonstrating react-native-llm-litert-mediapipe usage
 * with a downloadable Gemma 3n model and multimodal (image/audio) input
 * Demonstrates BOTH legacy API and new standardized API
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
  Animated,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';

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
import RNFS from 'react-native-fs';

const THEME = {
  gradient: ['#f6d365', '#fda085'],
  glassBg: 'rgba(255, 255, 255, 0.25)',
  glassBorder: 'rgba(255, 255, 255, 0.5)',
  shadow: {
    shadowColor: 'rgba(31, 38, 135, 0.15)',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 32,
    elevation: 8,
  },
  textColor: '#2d3436',
  primaryColor: '#6c5ce7',
  secondaryColor: '#00cec9',
  accentColor: '#fd79a8',
  xColor: '#0984e3',
  oColor: '#e84393',
};

const MODEL_URL = 'https://huggingface.co/example/gemma-3n-e4b/resolve/main/gemma-3n-e4b.task';
const MODEL_NAME = 'gemma-3n-e4b.task';

const PRESET_MEDIAPIPE_MODEL_PATH =
  `${RNFS.DocumentDirectoryPath}/16f676c9-6155-462a-a8bf-59247fc4c07b/gemma-3n-E4B-it-int4.task`;

const PRESET_LITERTLM_MODEL_PATH =
  `${RNFS.DocumentDirectoryPath}/litert/gemma-3n-E4B-it-int4.litertlm`;

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
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [audioUri, setAudioUri] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [audioDuration, setAudioDuration] = useState<number | null>(null);
  const [showModelSection, setShowModelSection] = useState(true);
  const [showMultimodalSection, setShowMultimodalSection] = useState(false);
  const scrollViewRef = React.useRef<ScrollView>(null);
  const fadeAnim = React.useRef(new Animated.Value(0)).current;

  const downloadableLlm = useLLM({
    modelUrl: MODEL_URL,
    modelName: MODEL_NAME,
    maxTokens: 1024,
    topK: 40,
    temperature: 0.8,
    randomSeed: 42,
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

  const localLlm = useLLM({
    storageType: 'file',
    modelPath: localModelPath ?? '',
    maxTokens: 1024,
    topK: 40,
    temperature: 0.8,
    randomSeed: 42,
    enableVisionModality: true,
    enableAudioModality: Platform.OS === 'android' && modelEngineType === 'litertlm',
  });

  const usingLocalModel = Boolean(localModelPath);
  const activeLlm = useMemo(
    () => (usingLocalModel ? localLlm : downloadableLlm),
    [usingLocalModel, localLlm, downloadableLlm]
  );
  const { generateStreamingResponse, isLoaded, addImage, addAudio } = activeLlm;

  useEffect(() => {
    return () => {
      if (isRecording) {
        AudioRecorder.cancelRecording().catch(() => {});
      }
    };
  }, [isRecording]);

  React.useEffect(() => {
    if (isLoaded) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }).start();
    }
  }, [isLoaded, fadeAnim]);

  const handleDownload = useCallback(async () => {
    try {
      await downloadModel({});
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

  const handleLoadPresetMediaPipe = useCallback(() => {
    setLocalModelError(null);

    if (Platform.OS !== 'android') {
      Alert.alert('Not Supported', 'Local fixed-path loading is Android only.');
      return;
    }

    console.log('Loading preset MediaPipe model from:', PRESET_MEDIAPIPE_MODEL_PATH);
    setModelEngineType('mediapipe');
    setLocalModelPath(PRESET_MEDIAPIPE_MODEL_PATH);
    setLocalModelName(PRESET_MEDIAPIPE_MODEL_PATH.split('/').pop() ?? 'model');
  }, []);

  const handleLoadPresetLiteRtLm = useCallback(() => {
    setLocalModelError(null);

    if (Platform.OS !== 'android') {
      Alert.alert('Not Supported', 'Local fixed-path loading is Android only.');
      return;
    }

    console.log('Loading preset LiteRT-LM model from:', PRESET_LITERTLM_MODEL_PATH);
    setModelEngineType('litertlm');
    setLocalModelPath(PRESET_LITERTLM_MODEL_PATH);
    setLocalModelName(PRESET_LITERTLM_MODEL_PATH.split('/').pop() ?? 'model');
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
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || !isLoaded) return;

    if (Platform.OS === 'ios' && (imageUri || audioUri)) {
      Alert.alert('Not Supported', 'iOS does not support multimodal input yet.');
      return;
    }

    setIsGenerating(true);
    setResponse('');

    try {
      if (imageUri && addImage) {
        console.log('Adding image to session:', imageUri);
        const imagePath = imageUri.startsWith('file://')
          ? imageUri.replace('file://', '')
          : imageUri;
        await addImage(imagePath);
      }

      if (audioUri && addAudio) {
        console.log('Adding audio to session:', audioUri);
        await addAudio(audioUri);
      }

      await generateStreamingResponse(
        prompt,
        (partialResponse: string) => {
          setResponse((prev) => prev + partialResponse);
        },
        (error: string) => {
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
      const engineLabel = modelEngineType === 'litertlm' ? 'LiteRT-LM' : modelEngineType === 'mediapipe' ? 'MediaPipe' : 'Unknown';
      if (isLoaded) return `${engineLabel} model ready`;
      return `Loading ${engineLabel} model...`;
    }
    if (isCheckingStatus) return 'Checking model status...';
    if (downloadStatus === 'not_downloaded') return 'Model not downloaded';
    if (downloadStatus === 'downloading') return `Downloading ${Math.round(downloadProgress * 100)}%`;
    if (downloadStatus === 'downloaded' && !isLoaded) return 'Ready to load';
    if (isLoaded) return 'Model ready';
    if (downloadStatus === 'error') return `Error: ${downloadError}`;
    return 'Unknown status';
  };

  const getStatusColor = () => {
    if (isLoaded) return THEME.secondaryColor;
    if (downloadStatus === 'downloading') return THEME.primaryColor;
    if (downloadStatus === 'error' || localModelError) return THEME.oColor;
    return '#f39c12';
  };

  return (
    <LinearGradient colors={THEME.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
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
            <Text style={styles.title}>MediaPipe LLM</Text>
            <Text style={styles.subtitle}>Gemma 3n • On-Device Inference</Text>
          </View>

          <TouchableOpacity
            style={[styles.glassCard, styles.collapsibleHeader]}
            onPress={() => setShowModelSection(!showModelSection)}
          >
            <View style={styles.collapsibleHeaderContent}>
              <Text style={styles.collapsibleTitle}>Model Management</Text>
              <Text style={[styles.collapsibleStatus, { color: getStatusColor() }]}>
                {getStatusText()}
              </Text>
            </View>
            <Text style={styles.collapsibleArrow}>{showModelSection ? '▼' : '▶'}</Text>
          </TouchableOpacity>

          {showModelSection && (
            <Animated.View style={styles.section}>
              <View style={[styles.glassCard, styles.statusCard]}>
                <View style={[styles.statusIndicator, { backgroundColor: getStatusColor() }]} />
                <Text style={styles.statusText}>{getStatusText()}</Text>
                {usingLocalModel && localModelName && (
                  <Text style={styles.statusSubtext}>
                    {localModelName}
                    {modelEngineType && ` (${modelEngineType === 'litertlm' ? 'LiteRT-LM' : 'MediaPipe'})`}
                  </Text>
                )}
                {!usingLocalModel && downloadStatus === 'downloading' && (
                  <View style={styles.progressBarContainer}>
                    <View style={styles.progressBarBg}>
                        <View
                          style={[styles.progressBarFill, { backgroundColor: THEME.primaryColor, width: `${downloadProgress * 100}%` }]}
                        />
                      </View>
                      <Text style={[styles.progressText, { color: THEME.primaryColor }]}>{Math.round(downloadProgress * 100)}%</Text>
                  </View>
                )}
                {localModelError && <Text style={styles.errorText}>{localModelError}</Text>}
              </View>

              <View style={styles.buttonRow}>
                <TouchableOpacity style={[styles.glassButton, styles.secondaryButton]} onPress={handlePickLocalModel}>
                  <Text style={[styles.buttonText, { color: THEME.textColor }]}>Import Model</Text>
                </TouchableOpacity>
                {usingLocalModel && (
                  <TouchableOpacity style={[styles.outlineButton]} onPress={handleClearLocalModel}>
                    <Text style={[styles.outlineButtonText, { color: THEME.textColor }]}>Use Downloaded</Text>
                  </TouchableOpacity>
                )}
              </View>

              {!usingLocalModel && Platform.OS === 'android' && (
                <View style={[styles.glassCard, styles.presetSection]}>
                  <Text style={styles.presetTitle}>Quick Load Presets</Text>
                  <View style={styles.buttonRow}>
                    <TouchableOpacity style={[styles.presetButton, { backgroundColor: THEME.xColor }]} onPress={handleLoadPresetMediaPipe}>
                      <Text style={styles.presetButtonText}>MediaPipe</Text>
                      <Text style={styles.presetSubtext}>.task (vision)</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.presetButton, { backgroundColor: THEME.oColor }]} onPress={handleLoadPresetLiteRtLm}>
                      <Text style={styles.presetButtonText}>LiteRT-LM</Text>
                      <Text style={styles.presetSubtext}>.litertlm (audio)</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              <View style={styles.buttonRow}>
                {!usingLocalModel && downloadStatus === 'not_downloaded' && (
                  <TouchableOpacity style={[styles.primaryButton, { backgroundColor: THEME.primaryColor }]} onPress={handleDownload}>
                    <Text style={styles.primaryButtonText}>Download Model</Text>
                  </TouchableOpacity>
                )}

                {!usingLocalModel && downloadStatus === 'downloaded' && !isLoaded && (
                  <TouchableOpacity style={[styles.primaryButton, { backgroundColor: THEME.primaryColor }]} onPress={handleLoad}>
                    <Text style={styles.primaryButtonText}>Load Model</Text>
                  </TouchableOpacity>
                )}
              </View>
            </Animated.View>
          )}

          {isLoaded && (
            <Animated.View style={{ opacity: fadeAnim }}>
              {Platform.OS === 'android' && (
                <>
                  <TouchableOpacity
                    style={[styles.glassCard, styles.collapsibleHeader]}
                    onPress={() => setShowMultimodalSection(!showMultimodalSection)}
                  >
                    <View style={styles.collapsibleHeaderContent}>
                      <Text style={styles.collapsibleTitle}>Multimodal Input</Text>
                      {(imageUri || audioUri) && (
                        <Text style={styles.collapsibleStatus}>Active</Text>
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

                        {audioUri && (
                          <Text style={[styles.audioInfo, { color: THEME.textColor }]}>
                            {audioUri.split('/').pop()}
                            {audioDuration && ` • ${audioDuration.toFixed(1)}s`}
                          </Text>
                        )}
                      </View>
                    </View>
                  )}
                </>
              )}

              <View style={[styles.glassCard, styles.promptSection]}>
                <Text style={[styles.inputLabel, { color: THEME.textColor }]}>Your Prompt</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Type your message here..."
                  placeholderTextColor="#6b7280"
                  value={prompt}
                  onChangeText={setPrompt}
                  multiline
                  onFocus={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
                />
                <TouchableOpacity
                  style={[styles.generateButton, { backgroundColor: THEME.primaryColor }, (!prompt.trim() || isGenerating) && styles.generateButtonDisabled]}
                  onPress={handleGenerate}
                  disabled={!prompt.trim() || isGenerating}
                >
                  {isGenerating ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.generateButtonText}>Generate Response</Text>
                  )}
                </TouchableOpacity>
              </View>

              <View style={[styles.glassCard, styles.responseSection]}>
                <Text style={[styles.responseLabel, { color: THEME.textColor }]}>Response</Text>
                <View style={styles.responseCard}>
                  <Text style={[styles.responseText, { color: THEME.textColor }]}>{response || 'AI response will appear here...'}</Text>
                </View>
              </View>
            </Animated.View>
          )}
          </ScrollView>
        </KeyboardAvoidingView>
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
  keyboardAvoider: {
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
    color: '#636e72',
  },
  collapsibleArrow: {
    fontSize: 14,
    color: '#636e72',
    marginLeft: 12,
  },
  section: {
    marginBottom: 8,
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
  statusSubtext: {
    color: '#636e72',
    fontSize: 14,
    marginBottom: 4,
  },
  progressBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  progressBarBg: {
    flex: 1,
    height: 6,
    backgroundColor: '#334155',
    borderRadius: 3,
    marginRight: 12,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 14,
    fontWeight: '600',
    minWidth: 40,
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
  glassButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {},
  outlineButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(0, 0, 0, 0.1)',
    backgroundColor: 'transparent',
  },
  outlineButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  presetSection: {
    padding: 16,
    marginBottom: 16,
  },
  presetTitle: {
    color: '#636e72',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  presetButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  presetButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 4,
  },
  presetSubtext: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 12,
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
    color: '#94a3b8',
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
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.5)',
    padding: 16,
    borderRadius: 12,
    fontSize: 16,
    minHeight: 120,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  generateButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  generateButtonDisabled: {
    opacity: 0.5,
  },
  generateButtonText: {
    color: '#fff',
    fontSize: 16,
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
