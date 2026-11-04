import React, { useEffect, useRef, useState } from 'react';
import {
  Mic,
  Square,
  Volume2,
  X,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import {
  evaluatePronunciation,
  PronunciationResult,
} from '../game/pronunciation';
import { soundFX } from '../game/sound';

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResult {
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionInstance extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
}

export interface PronunciationChallenge {
  mode: 'ingredient' | 'cook';
  targetWord: string;
  translationPt: string;
  phonetic: string;
  hintPt: string;
  accentHex: string;
  aliases: string[];
  ingredientId?: string;
}

interface PronunciationModalProps {
  challenge: PronunciationChallenge;
  onSuccess: (challenge: PronunciationChallenge, transcript: string) => void;
  onFailure: (transcript: string) => void;
  onClose: () => void;
}

/**
 * Downsamples a Float32Array audio buffer from `inputSampleRate` to 16000Hz Int16 PCM
 * and encodes it as Base64 for fast server-side Whisper transcription.
 */
function encodePcm16kBase64(
  chunks: Float32Array[],
  inputSampleRate: number
): string {
  const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
  const merged = new Float32Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  const targetRate = 16000;
  const ratio = inputSampleRate / targetRate;
  const outLength = Math.floor(merged.length / ratio);
  const int16Buffer = new ArrayBuffer(outLength * 2);
  const view = new DataView(int16Buffer);

  for (let i = 0; i < outLength; i++) {
    const srcIdx = Math.min(merged.length - 1, Math.floor(i * ratio));
    const clamped = Math.max(-1, Math.min(1, merged[srcIdx]));
    const int16 = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    view.setInt16(i * 2, int16, true);
  }

  const bytes = new Uint8Array(int16Buffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return window.btoa(binary);
}

export const PronunciationModal: React.FC<PronunciationModalProps> = ({
  challenge,
  onSuccess,
  onFailure,
  onClose,
}) => {
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [voiceLevel, setVoiceLevel] = useState(0); // 0 to 100 live mic meter
  const [result, setResult] = useState<PronunciationResult | null>(null);
  const [micHint, setMicHint] = useState<string | null>(null);
  const [practiceText, setPracticeText] = useState('');

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const stopCaptureFnRef = useRef<(() => void) | null>(null);
  const autoCloseTimeoutRef = useRef<number | null>(null);

  const cleanupAudioResources = () => {
    stopCaptureFnRef.current = null;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    if (processorRef.current) {
      try {
        processorRef.current.disconnect();
      } catch {
        // ignore
      }
      processorRef.current = null;
    }
    if (audioCtxRef.current) {
      try {
        audioCtxRef.current.close();
      } catch {
        // ignore
      }
      audioCtxRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
  };

  useEffect(() => {
    setResult(null);
    setMicHint(null);
    setPracticeText('');
    setIsListening(false);
    setIsTranscribing(false);
    setVoiceLevel(0);
    soundFX.playPop();

    return () => {
      cleanupAudioResources();
      if (autoCloseTimeoutRef.current) {
        window.clearTimeout(autoCloseTimeoutRef.current);
      }
    };
  }, [challenge]);

  const handleEvaluation = (spokenText: string) => {
    cleanupAudioResources();
    setIsListening(false);
    setIsTranscribing(false);
    setVoiceLevel(0);
    setMicHint(null);

    const evalRes = evaluatePronunciation(
      spokenText,
      challenge.targetWord,
      challenge.aliases
    );
    setResult(evalRes);

    if (evalRes.isMatch) {
      soundFX.playSuccess();
      autoCloseTimeoutRef.current = window.setTimeout(() => {
        onSuccess(challenge, spokenText);
      }, 950);
    } else {
      soundFX.playError();
      onFailure(spokenText);
    }
  };

  /**
   * Real Microphone Capture + Voice Activity Detection (VAD) + Whisper ASR:
   * - Listens to the user's real microphone via Web Audio API.
   * - Displays a live voice volume meter while the user speaks.
   * - Automatically detects when the user starts speaking and finishes speaking
   *   (or lets the user click the button again to stop).
   * - If the user stayed silent, rejects with "No voice detected" (never auto-passes!).
   * - Transcribes the recorded speech via local Whisper ASR (/api/transcribe) or Web Speech API
   *   and genuinely evaluates the spoken word against the target word.
   */
  const toggleMicrophone = async () => {
    // If already listening, clicking the button stops recording and evaluates immediately
    if (isListening && stopCaptureFnRef.current) {
      stopCaptureFnRef.current();
      return;
    }

    if (isTranscribing) return;

    setResult(null);
    setMicHint(null);

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia
    ) {
      setMicHint(
        'Seu navegador bloqueou o acesso ao microfone (precisa de HTTPS/permissão). Use o campo abaixo para testar!'
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioCtxRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const processor = audioCtx.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      const pcmChunks: Float32Array[] = [];
      let voicedFrames = 0;
      let silenceFramesAfterSpeech = 0;
      let finished = false;
      let webSpeechTranscript: string | null = null;
      const startTime = Date.now();
      const maxRecordingMs = 4500;

      // Also start native SpeechRecognition in parallel if supported by the browser
      const SpeechRecognitionCtor =
        (
          window as unknown as {
            SpeechRecognition?: new () => SpeechRecognitionInstance;
          }
        ).SpeechRecognition ||
        (
          window as unknown as {
            webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
          }
        ).webkitSpeechRecognition;

      if (SpeechRecognitionCtor) {
        try {
          const rec = new SpeechRecognitionCtor();
          rec.lang = 'en-US';
          rec.continuous = false;
          rec.interimResults = false;
          rec.maxAlternatives = 5;
          recognitionRef.current = rec;

          rec.onresult = (event: SpeechRecognitionEvent) => {
            const first = event.results[0];
            if (first && first.length > 0) {
              // Check if any alternative matches
              for (let i = 0; i < first.length; i++) {
                const candidate = first[i].transcript;
                if (
                  evaluatePronunciation(
                    candidate,
                    challenge.targetWord,
                    challenge.aliases
                  ).isMatch
                ) {
                  webSpeechTranscript = candidate;
                  break;
                }
              }
              if (!webSpeechTranscript) {
                webSpeechTranscript = first[0].transcript;
              }
              if (!finished) {
                finishAndEvaluate();
              }
            }
          };
          rec.start();
        } catch {
          // Ignore Web Speech API error; Web Audio PCM + Whisper handles it
        }
      }

      const finishAndEvaluate = async () => {
        if (finished) return;
        finished = true;

        const inputSampleRate = audioCtx.sampleRate;
        cleanupAudioResources();
        setIsListening(false);
        setVoiceLevel(0);

        // 1. If Web Speech API already captured a transcript, evaluate it directly
        if (webSpeechTranscript && webSpeechTranscript.trim().length > 0) {
          handleEvaluation(webSpeechTranscript);
          return;
        }

        // 2. Verify that the user actually spoke into the microphone (Voice Activity Detection)
        if (voicedFrames < 2) {
          handleEvaluation(''); // Triggers "We did not hear anything. Try speaking closer to the microphone!"
          return;
        }

        // 3. Send recorded 16kHz PCM audio to our local Whisper ASR endpoint
        setIsTranscribing(true);
        setMicHint('Avaliando sua pronúncia...');
        try {
          const pcmBase64 = encodePcm16kBase64(pcmChunks, inputSampleRate);
          const response = await fetch('/api/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pcmBase64 }),
          });

          if (response.ok) {
            const data = (await response.json()) as { transcript?: string };
            handleEvaluation(data.transcript || '');
            return;
          }
        } catch {
          // ignore network error
        }

        handleEvaluation('');
      };

      stopCaptureFnRef.current = finishAndEvaluate;

      processor.onaudioprocess = (e: AudioProcessingEvent) => {
        if (finished) return;
        const input = e.inputBuffer.getChannelData(0);
        const copy = new Float32Array(input.length);
        copy.set(input);
        pcmChunks.push(copy);

        // Compute RMS voice energy
        let sumSq = 0;
        for (let i = 0; i < input.length; i++) {
          sumSq += input[i] * input[i];
        }
        const rms = Math.sqrt(sumSq / input.length);
        const levelPct = Math.min(100, Math.round(rms * 420));
        setVoiceLevel(levelPct);

        // Voice Activity Detection (VAD) threshold
        if (rms > 0.018) {
          voicedFrames += 1;
          silenceFramesAfterSpeech = 0;
          setMicHint(
            `Ouvindo sua voz... (Clique novamente para finalizar)`
          );
        } else if (voicedFrames >= 3) {
          silenceFramesAfterSpeech += 1;
          // ~0.75 seconds of silence after speaking a word -> auto-stop and evaluate!
          if (silenceFramesAfterSpeech >= 8) {
            finishAndEvaluate();
            return;
          }
        }

        if (Date.now() - startTime >= maxRecordingMs) {
          finishAndEvaluate();
        }
      };

      source.connect(processor);
      processor.connect(audioCtx.destination);

      soundFX.playMicStart();
      setIsListening(true);
      setMicHint(
        `Fale "${challenge.targetWord.toUpperCase()}" no microfone agora!`
      );
    } catch {
      cleanupAudioResources();
      setIsListening(false);
      setMicHint(
        'Permissão do microfone negada pelo navegador. Permita o uso do microfone no ícone de cadeado da barra de endereços!'
      );
    }
  };

  const handlePracticeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!practiceText.trim()) return;
    handleEvaluation(practiceText);
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center p-4 pointer-events-auto"
      style={{ backgroundColor: 'rgba(10, 10, 14, 0.72)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pronunciation-modal-title"
    >
      <div
        className="relative w-full max-w-md rounded-2xl border border-white/15 p-6 text-white shadow-2xl"
        style={{ backgroundColor: 'rgba(20, 21, 26, 0.98)' }}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close pronunciation modal"
          className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Header Kicker */}
        <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-amber-400">
          <Sparkles className="h-3.5 w-3.5" />
          <span>
            {challenge.mode === 'ingredient'
              ? 'SAY THE INGREDIENT IN ENGLISH'
              : 'SAY THE DISH NAME TO COOK'}
          </span>
        </div>

        {/* Target Word Display */}
        <div className="mt-4 text-center">
          <h2
            id="pronunciation-modal-title"
            className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl"
          >
            {challenge.targetWord.toUpperCase()}
          </h2>

          <div className="mt-2 flex items-center justify-center gap-3 text-sm text-zinc-300">
            <span className="font-mono text-amber-300">{challenge.phonetic}</span>
            <span aria-hidden="true">·</span>
            <span className="font-medium text-emerald-300">
              Trad.: {challenge.translationPt}
            </span>
          </div>

          <p className="mt-1.5 text-xs text-zinc-400">{challenge.hintPt}</p>

          {/* Listen Native Audio Button */}
          <div className="mt-3 flex justify-center">
            <button
              type="button"
              onClick={() => soundFX.speakWord(challenge.targetWord)}
              className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-white/10 transition-colors"
            >
              <Volume2 className="h-3.5 w-3.5 text-amber-400" />
              <span>Listen in English</span>
            </button>
          </div>
        </div>

        {/* Central Microphone Action */}
        <div className="mt-6 flex flex-col items-center">
          <button
            type="button"
            onClick={toggleMicrophone}
            disabled={isTranscribing}
            aria-label={`Speak ${challenge.targetWord} into microphone`}
            className={`group relative flex h-24 w-24 items-center justify-center rounded-full border-2 transition-transform active:scale-95 ${
              isListening
                ? 'border-rose-400 bg-rose-500/25 text-rose-200 scale-105'
                : isTranscribing
                ? 'border-sky-400 bg-sky-500/20 text-sky-200'
                : 'border-amber-400/80 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 hover:scale-105'
            }`}
          >
            {isListening ? (
              <Square className="h-8 w-8 fill-current" />
            ) : (
              <Mic className="h-10 w-10" />
            )}
          </button>

          <span className="mt-3 text-center text-xs font-semibold text-zinc-200">
            {micHint
              ? micHint
              : isListening
              ? `Fale "${challenge.targetWord.toUpperCase()}" agora (ou clique para parar)`
              : 'Click the Microphone & Speak in English'}
          </span>

          {/* Live Voice Volume Meter */}
          {isListening && (
            <div className="mt-2.5 flex items-center gap-2 w-52">
              <span className="text-[10px] font-mono text-zinc-400">VOL</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-emerald-400 transition-all duration-75"
                  style={{ width: `${Math.max(6, voiceLevel)}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Pronunciation Result Banner */}
        {result && (
          <div
            role="status"
            className={`mt-5 rounded-xl border p-3.5 ${
              result.isMatch
                ? 'border-emerald-500/40 bg-emerald-950/60 text-emerald-200'
                : 'border-rose-500/40 bg-rose-950/60 text-rose-200'
            }`}
          >
            <div className="flex items-start gap-2.5">
              {result.isMatch ? (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400 mt-0.5" />
              ) : (
                <AlertCircle className="h-5 w-5 shrink-0 text-rose-400 mt-0.5" />
              )}
              <div className="flex-1 text-xs">
                <p className="font-bold text-sm">
                  {result.isMatch ? 'Excellent Pronunciation!' : 'Try again!'}
                </p>
                <p className="mt-0.5 text-zinc-200">{result.feedbackEn}</p>
                <p className="mt-0.5 text-zinc-400">{result.feedbackPt}</p>
              </div>
              {!result.isMatch && (
                <button
                  type="button"
                  onClick={() => {
                    setResult(null);
                    toggleMicrophone();
                  }}
                  className="inline-flex items-center gap-1 rounded-lg bg-rose-500/30 border border-rose-400/40 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-rose-500/40 whitespace-nowrap shrink-0"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Repeat</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Quick 1-Click Voice Simulator & Text Practice */}
        <div className="mt-6 border-t border-white/10 pt-4">
          <div className="flex items-center justify-between text-xs text-zinc-400 mb-2">
            <span>Manual test (without mic):</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleEvaluation(challenge.targetWord)}
                className="rounded bg-emerald-500/20 border border-emerald-500/30 px-2.5 py-1 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/30 transition-colors whitespace-nowrap shrink-0"
              >
                Say &ldquo;{challenge.targetWord}&rdquo;
              </button>
              <button
                type="button"
                onClick={() => handleEvaluation('Potato')}
                className="rounded bg-rose-500/15 border border-rose-500/30 px-2.5 py-1 text-xs font-semibold text-rose-300 hover:bg-rose-500/25 transition-colors whitespace-nowrap shrink-0"
              >
                Test Wrong Word
              </button>
            </div>
          </div>

          <form onSubmit={handlePracticeSubmit} className="flex gap-2">
            <label htmlFor="voice-sim-input" className="sr-only">
              Type pronunciation transcript
            </label>
            <input
              id="voice-sim-input"
              type="text"
              value={practiceText}
              onChange={(e) => setPracticeText(e.target.value)}
              placeholder={`Or type pronunciation (e.g. "${challenge.targetWord.toLowerCase()}")`}
              className="flex-1 rounded-lg border border-white/15 bg-black/40 px-3 py-2 text-xs text-white placeholder-zinc-500 focus:border-amber-400 focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-lg bg-amber-500 px-3.5 py-2 text-xs font-bold text-zinc-950 hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0"
            >
              Verify Speech
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
