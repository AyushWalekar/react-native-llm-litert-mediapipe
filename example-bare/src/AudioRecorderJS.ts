/**
 * Pure JavaScript audio recorder using react-native-live-audio-stream.
 *
 * This module records audio in the exact format required by LiteRT-LM:
 * - 16kHz sample rate
 * - Mono channel
 * - 16-bit PCM
 * - WAV container format
 *
 * No custom native modules required - uses standard RN libraries.
 */
import {Platform} from 'react-native';
import LiveAudioStream from 'react-native-live-audio-stream';
import RNFS from 'react-native-fs';

// LiteRT-LM required audio format (matching Gallery app)
const SAMPLE_RATE = 16000;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;
const MAX_DURATION_SECONDS = 30;

export interface AudioRecordingResult {
  path: string;
  size: number;
  duration: number;
  sampleRate: number;
}

export interface AudioAmplitudeEvent {
  amplitude: number;
  duration: number;
}

// Recording state
let isCurrentlyRecording = false;
let pcmChunks: string[] = [];
let recordingStartTime = 0;
let amplitudeCallback: ((event: AudioAmplitudeEvent) => void) | null = null;

/**
 * Initialize the audio stream with LiteRT-LM compatible settings.
 */
function initializeStream() {
  LiveAudioStream.init({
    sampleRate: SAMPLE_RATE,
    channels: CHANNELS,
    bitsPerSample: BITS_PER_SAMPLE,
    audioSource: 6, // VOICE_RECOGNITION for better quality
    bufferSize: 4096,
    wavFile: '', // Not using WAV file output, we create WAV manually
  });

  LiveAudioStream.on('data', (base64Data: string) => {
    if (!isCurrentlyRecording) return;

    pcmChunks.push(base64Data);

    // Calculate amplitude for UI feedback
    if (amplitudeCallback) {
      const amplitude = calculateAmplitudeFromBase64(base64Data);
      const duration = (Date.now() - recordingStartTime) / 1000;
      amplitudeCallback({amplitude, duration});

      // Auto-stop at max duration
      if (duration >= MAX_DURATION_SECONDS) {
        stopRecording().catch(console.error);
      }
    }
  });
}

/**
 * Calculate peak amplitude from base64 PCM data.
 */
function calculateAmplitudeFromBase64(base64Data: string): number {
  try {
    // Decode base64 to bytes
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // Find peak amplitude in 16-bit samples (little-endian)
    let maxAmplitude = 0;
    for (let i = 0; i < bytes.length - 1; i += 2) {
      const sample = bytes[i] | (bytes[i + 1] << 8);
      // Convert to signed 16-bit
      const signedSample = sample > 32767 ? sample - 65536 : sample;
      const amplitude = Math.abs(signedSample);
      if (amplitude > maxAmplitude) {
        maxAmplitude = amplitude;
      }
    }
    return maxAmplitude;
  } catch {
    return 0;
  }
}

/**
 * Create WAV file header for PCM data.
 * Matches the Gallery app's genByteArrayForWav() implementation.
 */
function createWavHeader(pcmDataLength: number): Uint8Array {
  const header = new Uint8Array(44);
  const wavFileSize = pcmDataLength + 44;
  const byteRate = (SAMPLE_RATE * CHANNELS * BITS_PER_SAMPLE) / 8;
  const blockAlign = (CHANNELS * BITS_PER_SAMPLE) / 8;

  // RIFF chunk descriptor
  header[0] = 'R'.charCodeAt(0);
  header[1] = 'I'.charCodeAt(0);
  header[2] = 'F'.charCodeAt(0);
  header[3] = 'F'.charCodeAt(0);
  // File size - 8
  header[4] = (wavFileSize - 8) & 0xff;
  header[5] = ((wavFileSize - 8) >> 8) & 0xff;
  header[6] = ((wavFileSize - 8) >> 16) & 0xff;
  header[7] = ((wavFileSize - 8) >> 24) & 0xff;
  // WAVE
  header[8] = 'W'.charCodeAt(0);
  header[9] = 'A'.charCodeAt(0);
  header[10] = 'V'.charCodeAt(0);
  header[11] = 'E'.charCodeAt(0);
  // fmt subchunk
  header[12] = 'f'.charCodeAt(0);
  header[13] = 'm'.charCodeAt(0);
  header[14] = 't'.charCodeAt(0);
  header[15] = ' '.charCodeAt(0);
  // Subchunk1Size (16 for PCM)
  header[16] = 16;
  header[17] = 0;
  header[18] = 0;
  header[19] = 0;
  // AudioFormat (1 = PCM)
  header[20] = 1;
  header[21] = 0;
  // NumChannels
  header[22] = CHANNELS;
  header[23] = 0;
  // SampleRate
  header[24] = SAMPLE_RATE & 0xff;
  header[25] = (SAMPLE_RATE >> 8) & 0xff;
  header[26] = (SAMPLE_RATE >> 16) & 0xff;
  header[27] = (SAMPLE_RATE >> 24) & 0xff;
  // ByteRate
  header[28] = byteRate & 0xff;
  header[29] = (byteRate >> 8) & 0xff;
  header[30] = (byteRate >> 16) & 0xff;
  header[31] = (byteRate >> 24) & 0xff;
  // BlockAlign
  header[32] = blockAlign;
  header[33] = 0;
  // BitsPerSample
  header[34] = BITS_PER_SAMPLE;
  header[35] = 0;
  // data subchunk
  header[36] = 'd'.charCodeAt(0);
  header[37] = 'a'.charCodeAt(0);
  header[38] = 't'.charCodeAt(0);
  header[39] = 'a'.charCodeAt(0);
  // Subchunk2Size (PCM data size)
  header[40] = pcmDataLength & 0xff;
  header[41] = (pcmDataLength >> 8) & 0xff;
  header[42] = (pcmDataLength >> 16) & 0xff;
  header[43] = (pcmDataLength >> 24) & 0xff;

  return header;
}

/**
 * Convert base64 PCM chunks to a single Uint8Array.
 */
function base64ChunksToBytes(chunks: string[]): Uint8Array {
  // First pass: calculate total length
  let totalLength = 0;
  const decodedChunks: Uint8Array[] = [];

  for (const chunk of chunks) {
    const binaryString = atob(chunk);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    decodedChunks.push(bytes);
    totalLength += bytes.length;
  }

  // Second pass: combine all chunks
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const bytes of decodedChunks) {
    result.set(bytes, offset);
    offset += bytes.length;
  }

  return result;
}

/**
 * Convert Uint8Array to base64 string.
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

let streamInitialized = false;

/**
 * Start recording audio in LiteRT-LM compatible format.
 * Requires RECORD_AUDIO permission to be granted.
 */
export async function startRecording(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    throw new Error('AudioRecorder is only available on Android');
  }

  if (isCurrentlyRecording) {
    throw new Error('Recording already in progress');
  }

  // Initialize stream on first use
  if (!streamInitialized) {
    initializeStream();
    streamInitialized = true;
  }

  // Reset state
  pcmChunks = [];
  recordingStartTime = Date.now();
  isCurrentlyRecording = true;

  // Start the stream
  LiveAudioStream.start();
  console.log('AudioRecorder: Started recording at 16kHz mono PCM16');

  return true;
}

/**
 * Stop recording and get the path to the WAV file.
 * @returns Recording result with path, size, duration, and sample rate
 */
export async function stopRecording(): Promise<AudioRecordingResult> {
  if (Platform.OS !== 'android') {
    throw new Error('AudioRecorder is only available on Android');
  }

  if (!isCurrentlyRecording) {
    throw new Error('No recording in progress');
  }

  isCurrentlyRecording = false;
  LiveAudioStream.stop();

  // Convert PCM chunks to bytes
  const pcmData = base64ChunksToBytes(pcmChunks);
  pcmChunks = [];

  if (pcmData.length === 0) {
    throw new Error('No audio data recorded');
  }

  // Create WAV file
  const wavHeader = createWavHeader(pcmData.length);
  const wavData = new Uint8Array(wavHeader.length + pcmData.length);
  wavData.set(wavHeader, 0);
  wavData.set(pcmData, wavHeader.length);

  // Save to file
  const fileName = `recording_${Date.now()}.wav`;
  const filePath = `${RNFS.DocumentDirectoryPath}/${fileName}`;
  const base64Data = uint8ArrayToBase64(wavData);
  await RNFS.writeFile(filePath, base64Data, 'base64');

  const duration =
    pcmData.length / (SAMPLE_RATE * CHANNELS * (BITS_PER_SAMPLE / 8));

  console.log(
    `AudioRecorder: Saved ${filePath} (${
      wavData.length
    } bytes, ${duration.toFixed(1)}s)`,
  );

  return {
    path: filePath,
    size: wavData.length,
    duration,
    sampleRate: SAMPLE_RATE,
  };
}

/**
 * Cancel recording without saving.
 */
export async function cancelRecording(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    throw new Error('AudioRecorder is only available on Android');
  }

  if (isCurrentlyRecording) {
    isCurrentlyRecording = false;
    LiveAudioStream.stop();
    pcmChunks = [];
  }

  return true;
}

/**
 * Check if recording is in progress.
 */
export async function isRecording(): Promise<boolean> {
  return isCurrentlyRecording;
}

/**
 * Subscribe to amplitude updates during recording.
 * Useful for showing audio level visualization.
 */
export function onAmplitudeUpdate(
  callback: (event: AudioAmplitudeEvent) => void,
): () => void {
  amplitudeCallback = callback;
  return () => {
    amplitudeCallback = null;
  };
}
