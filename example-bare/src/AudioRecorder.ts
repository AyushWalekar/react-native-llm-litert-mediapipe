/**
 * TypeScript wrapper for the native AudioRecorderModule.
 * 
 * This module records audio in the exact format required by LiteRT-LM:
 * - 16kHz sample rate
 * - Mono channel
 * - 16-bit PCM
 * - WAV container format
 */
import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

interface AudioRecordingResult {
  path: string;
  size: number;
  duration: number;
  sampleRate: number;
}

interface AudioAmplitudeEvent {
  amplitude: number;
  duration: number;
}

const { AudioRecorderModule } = NativeModules;

let eventEmitter: NativeEventEmitter | null = null;

function getEventEmitter(): NativeEventEmitter {
  if (!eventEmitter && AudioRecorderModule) {
    eventEmitter = new NativeEventEmitter(AudioRecorderModule);
  }
  return eventEmitter!;
}

/**
 * Start recording audio in LiteRT-LM compatible format.
 * Requires RECORD_AUDIO permission to be granted.
 */
export async function startRecording(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    throw new Error('AudioRecorder is only available on Android');
  }
  return AudioRecorderModule.startRecording();
}

/**
 * Stop recording and get the path to the WAV file.
 * @returns Recording result with path, size, duration, and sample rate
 */
export async function stopRecording(): Promise<AudioRecordingResult> {
  if (Platform.OS !== 'android') {
    throw new Error('AudioRecorder is only available on Android');
  }
  return AudioRecorderModule.stopRecording();
}

/**
 * Cancel recording without saving.
 */
export async function cancelRecording(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    throw new Error('AudioRecorder is only available on Android');
  }
  return AudioRecorderModule.cancelRecording();
}

/**
 * Check if recording is in progress.
 */
export async function isRecording(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return false;
  }
  return AudioRecorderModule.isRecording();
}

/**
 * Subscribe to amplitude updates during recording.
 * Useful for showing audio level visualization.
 */
export function onAmplitudeUpdate(
  callback: (event: AudioAmplitudeEvent) => void
): () => void {
  if (Platform.OS !== 'android') {
    return () => {};
  }
  const emitter = getEventEmitter();
  const subscription = emitter.addListener('onAudioAmplitude', callback);
  return () => subscription.remove();
}
