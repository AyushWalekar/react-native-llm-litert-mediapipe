package com.mediapipellmexample

import android.annotation.SuppressLint
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import kotlinx.coroutines.*
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream

/**
 * Native audio recorder module that records audio in the exact format 
 * required by LiteRT-LM (16kHz, mono, PCM 16-bit WAV).
 * 
 * This matches the Gallery app's AudioRecorderPanel implementation.
 */
class AudioRecorderModule(reactContext: ReactApplicationContext) : 
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "AudioRecorderModule"
        private const val SAMPLE_RATE = 16000
        private const val CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_MONO
        private const val AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT
        private const val MAX_DURATION_SECONDS = 30
    }

    private var audioRecord: AudioRecord? = null
    private var recordingJob: Job? = null
    private val coroutineScope = CoroutineScope(Dispatchers.IO + SupervisorJob())
    private var audioStream = ByteArrayOutputStream()
    private var isRecording = false
    private var recordingStartTime = 0L

    override fun getName(): String = "AudioRecorderModule"

    private fun sendEvent(eventName: String, params: WritableMap) {
        reactApplicationContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Required for RN event emitter
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required for RN event emitter
    }

    @SuppressLint("MissingPermission")
    @ReactMethod
    fun startRecording(promise: Promise) {
        if (isRecording) {
            promise.reject("ALREADY_RECORDING", "Recording is already in progress")
            return
        }

        try {
            val minBufferSize = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL_CONFIG, AUDIO_FORMAT)
            if (minBufferSize == AudioRecord.ERROR || minBufferSize == AudioRecord.ERROR_BAD_VALUE) {
                promise.reject("BUFFER_ERROR", "Failed to get minimum buffer size")
                return
            }

            audioRecord?.release()
            audioStream.reset()

            audioRecord = AudioRecord(
                MediaRecorder.AudioSource.MIC,
                SAMPLE_RATE,
                CHANNEL_CONFIG,
                AUDIO_FORMAT,
                minBufferSize
            )

            if (audioRecord?.state != AudioRecord.STATE_INITIALIZED) {
                promise.reject("INIT_ERROR", "Failed to initialize AudioRecord")
                audioRecord?.release()
                audioRecord = null
                return
            }

            val buffer = ByteArray(minBufferSize)
            isRecording = true
            recordingStartTime = System.currentTimeMillis()

            recordingJob = coroutineScope.launch {
                try {
                    audioRecord?.startRecording()
                    Log.d(TAG, "Recording started at $SAMPLE_RATE Hz, mono, PCM16")

                    while (isRecording && audioRecord?.recordingState == AudioRecord.RECORDSTATE_RECORDING) {
                        val bytesRead = audioRecord?.read(buffer, 0, buffer.size) ?: 0
                        if (bytesRead > 0) {
                            audioStream.write(buffer, 0, bytesRead)
                            
                            // Calculate and send amplitude for UI feedback
                            val amplitude = calculatePeakAmplitude(buffer, bytesRead)
                            val params = Arguments.createMap().apply {
                                putInt("amplitude", amplitude)
                                putDouble("duration", (System.currentTimeMillis() - recordingStartTime) / 1000.0)
                            }
                            sendEvent("onAudioAmplitude", params)
                        }

                        // Check max duration
                        val elapsed = System.currentTimeMillis() - recordingStartTime
                        if (elapsed >= MAX_DURATION_SECONDS * 1000) {
                            Log.d(TAG, "Max duration reached, stopping recording")
                            break
                        }
                    }
                } catch (e: Exception) {
                    Log.e(TAG, "Error during recording: ${e.message}", e)
                }
            }

            promise.resolve(true)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to start recording: ${e.message}", e)
            promise.reject("START_ERROR", "Failed to start recording: ${e.message}", e)
        }
    }

    @ReactMethod
    fun stopRecording(promise: Promise) {
        if (!isRecording) {
            promise.reject("NOT_RECORDING", "No recording in progress")
            return
        }

        try {
            isRecording = false
            recordingJob?.cancel()

            if (audioRecord?.recordingState == AudioRecord.RECORDSTATE_RECORDING) {
                audioRecord?.stop()
            }
            audioRecord?.release()
            audioRecord = null

            val pcmData = audioStream.toByteArray()
            audioStream.reset()

            if (pcmData.isEmpty()) {
                promise.reject("NO_DATA", "No audio data recorded")
                return
            }

            // Create WAV file with proper header (matching Gallery app's genByteArrayForWav)
            val wavData = createWavData(pcmData)
            
            // Save to file
            val outputDir = reactApplicationContext.filesDir
            val outputFile = File(outputDir, "recording_${System.currentTimeMillis()}.wav")
            FileOutputStream(outputFile).use { fos ->
                fos.write(wavData)
            }

            Log.d(TAG, "Recording saved: ${outputFile.absolutePath} (${wavData.size} bytes, PCM: ${pcmData.size} bytes)")

            val result = Arguments.createMap().apply {
                putString("path", outputFile.absolutePath)
                putInt("size", wavData.size)
                putDouble("duration", pcmData.size.toDouble() / (SAMPLE_RATE * 2)) // 2 bytes per sample
                putInt("sampleRate", SAMPLE_RATE)
            }
            promise.resolve(result)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to stop recording: ${e.message}", e)
            promise.reject("STOP_ERROR", "Failed to stop recording: ${e.message}", e)
        }
    }

    @ReactMethod
    fun cancelRecording(promise: Promise) {
        isRecording = false
        recordingJob?.cancel()
        
        if (audioRecord?.recordingState == AudioRecord.RECORDSTATE_RECORDING) {
            audioRecord?.stop()
        }
        audioRecord?.release()
        audioRecord = null
        audioStream.reset()
        
        promise.resolve(true)
    }

    @ReactMethod
    fun isRecording(promise: Promise) {
        promise.resolve(isRecording)
    }

    /**
     * Creates a WAV file byte array from raw PCM data.
     * Matches the Gallery app's ChatMessageAudioClip.genByteArrayForWav() implementation.
     */
    private fun createWavData(pcmData: ByteArray): ByteArray {
        val header = ByteArray(44)
        val pcmDataSize = pcmData.size
        val wavFileSize = pcmDataSize + 44
        val channels = 1 // Mono
        val bitsPerSample: Short = 16
        val byteRate = SAMPLE_RATE * channels * bitsPerSample / 8

        // RIFF/WAVE header
        header[0] = 'R'.code.toByte()
        header[1] = 'I'.code.toByte()
        header[2] = 'F'.code.toByte()
        header[3] = 'F'.code.toByte()
        header[4] = (wavFileSize and 0xff).toByte()
        header[5] = (wavFileSize shr 8 and 0xff).toByte()
        header[6] = (wavFileSize shr 16 and 0xff).toByte()
        header[7] = (wavFileSize shr 24 and 0xff).toByte()
        header[8] = 'W'.code.toByte()
        header[9] = 'A'.code.toByte()
        header[10] = 'V'.code.toByte()
        header[11] = 'E'.code.toByte()
        header[12] = 'f'.code.toByte()
        header[13] = 'm'.code.toByte()
        header[14] = 't'.code.toByte()
        header[15] = ' '.code.toByte()
        header[16] = 16 // Sub-chunk size (16 for PCM)
        header[17] = 0
        header[18] = 0
        header[19] = 0
        header[20] = 1 // Audio format (1 for PCM)
        header[21] = 0
        header[22] = channels.toByte() // Number of channels
        header[23] = 0
        header[24] = (SAMPLE_RATE and 0xff).toByte()
        header[25] = (SAMPLE_RATE shr 8 and 0xff).toByte()
        header[26] = (SAMPLE_RATE shr 16 and 0xff).toByte()
        header[27] = (SAMPLE_RATE shr 24 and 0xff).toByte()
        header[28] = (byteRate and 0xff).toByte()
        header[29] = (byteRate shr 8 and 0xff).toByte()
        header[30] = (byteRate shr 16 and 0xff).toByte()
        header[31] = (byteRate shr 24 and 0xff).toByte()
        header[32] = (channels * bitsPerSample / 8).toByte() // Block align
        header[33] = 0
        header[34] = bitsPerSample.toByte() // Bits per sample
        header[35] = (bitsPerSample.toInt() shr 8 and 0xff).toByte()
        header[36] = 'd'.code.toByte()
        header[37] = 'a'.code.toByte()
        header[38] = 't'.code.toByte()
        header[39] = 'a'.code.toByte()
        header[40] = (pcmDataSize and 0xff).toByte()
        header[41] = (pcmDataSize shr 8 and 0xff).toByte()
        header[42] = (pcmDataSize shr 16 and 0xff).toByte()
        header[43] = (pcmDataSize shr 24 and 0xff).toByte()

        return header + pcmData
    }

    /**
     * Calculate peak amplitude from audio buffer for UI visualization.
     */
    private fun calculatePeakAmplitude(buffer: ByteArray, bytesRead: Int): Int {
        var maxAmplitude = 0
        var i = 0
        while (i < bytesRead - 1) {
            // Convert two bytes to a 16-bit sample (little-endian)
            val sample = (buffer[i].toInt() and 0xFF) or (buffer[i + 1].toInt() shl 8)
            val amplitude = kotlin.math.abs(sample.toShort().toInt())
            if (amplitude > maxAmplitude) {
                maxAmplitude = amplitude
            }
            i += 2
        }
        return maxAmplitude
    }
}
