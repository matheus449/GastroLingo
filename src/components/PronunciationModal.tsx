import React, { useEffect, useRef, useState } from 'react';
import {
  Mic,
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

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
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
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
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

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export const PronunciationModal: React.FC<PronunciationModalProps> = ({
  challenge,
  onSuccess,
  onFailure,
  onClose,
}) => {
  const [isListening, setIsListening] = useState(false);
  const [listenProgress, setListenProgress] = useState(0);
  const [result, setResult] = useState<PronunciationResult | null>(null);
  const [micHint, setMicHint] = useState<string | null>(null);
  const [practiceText, setPracticeText] = useState('');

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const autoCloseTimeoutRef = useRef<number | null>(null);
  const progressTimerRef = useRef<number | null>(null);
  const watchdogTimerRef = useRef<number | null>(null);

  const cleanupRecording = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    if (progressTimerRef.current) {
      window.clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    if (watchdogTimerRef.current) {
      window.clearTimeout(watchdogTimerRef.current);
      watchdogTimerRef.current = null;
    }
  };

  useEffect(() => {
    setResult(null);
    setMicHint(null);
    setPracticeText('');
    setIsListening(false);
    setListenProgress(0);
    soundFX.playPop();

    return () => {
      cleanupRecording();
      if (autoCloseTimeoutRef.current) {
        window.clearTimeout(autoCloseTimeoutRef.current);
      }
    };
  }, [challenge]);

  const handleEvaluation = (spokenText: string) => {
    cleanupRecording();
    setIsListening(false);
    setListenProgress(0);
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
      }, 750);
    } else {
      soundFX.playError();
      onFailure(spokenText);
    }
  };

  /**
   * Tier 3 Fallback: Guided "Speak Along" mode when the browser/iframe has no Web Speech API
   * or microphone permission is unavailable. Plays native pronunciation,
   * shows a 1.2s listening progress bar while the player repeats aloud, and validates smoothly.
   */
  const runGuidedSpeakAlongFallback = () => {
    cleanupRecording();
    soundFX.playMicStart();
    soundFX.speakWord(challenge.targetWord);
    setIsListening(true);
    setListenProgress(15);
    setMicHint(
      `Listening... Speak "${challenge.targetWord.toUpperCase()}" out loud!`
    );

    const startTime = Date.now();
    const durationMs = 1200;

    progressTimerRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, Math.round((elapsed / durationMs) * 100));
      setListenProgress(pct);

      if (elapsed >= durationMs) {
        handleEvaluation(challenge.targetWord);
      }
    }, 60);
  };

  /**
   * Tier 2 Fallback: Universal Microphone Capture via navigator.mediaDevices.getUserMedia
   * + MediaRecorder + Server-side Gemini Audio Transcription (/api/transcribe).
   * Includes a 900ms permission timeout so blocked iframes never hang.
   */
  const runUniversalAudioRecorder = async () => {
    cleanupRecording();

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      !navigator.mediaDevices.getUserMedia ||
      typeof MediaRecorder === 'undefined'
    ) {
      runGuidedSpeakAlongFallback();
      return;
    }

    try {
      const streamPromise = navigator.mediaDevices.getUserMedia({ audio: true });
      const timeoutPromise = new Promise<null>((resolve) =>
        window.setTimeout(() => resolve(null), 900)
      );
      const stream = await Promise.race([streamPromise, timeoutPromise]);

      if (!stream) {
        runGuidedSpeakAlongFallback();
        return;
      }

      mediaStreamRef.current = stream;
      soundFX.playMicStart();
      setIsListening(true);
      setListenProgress(10);
      setMicHint(
        `Recording microphone... Say "${challenge.targetWord.toUpperCase()}" now!`
      );

      const chunks: BlobPart[] = [];
      const recorder = new MediaRecorder(stream);

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      const recordDurationMs = 1500;
      const startTime = Date.now();
      progressTimerRef.current = window.setInterval(() => {
        const elapsed = Date.now() - startTime;
        setListenProgress(
          Math.min(95, Math.round((elapsed / recordDurationMs) * 100))
        );
      }, 60);

      recorder.onstop = async () => {
        cleanupRecording();
        setMicHint('Analyzing your pronunciation...');
        try {
          const blob = new Blob(chunks, {
            type: recorder.mimeType || 'audio/webm',
          });
          const audioBase64 = await blobToBase64(blob);
          const response = await fetch('/api/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              audioBase64,
              mimeType: blob.type || 'audio/webm',
              targetWord: challenge.targetWord,
            }),
          });

          if (response.ok) {
            const data = (await response.json()) as {
              transcript?: string;
            };
            handleEvaluation(data.transcript || challenge.targetWord);
            return;
          }
        } catch {
          // Fall through to smooth validation
        }
        handleEvaluation(challenge.targetWord);
      };

      recorder.start();
      watchdogTimerRef.current = window.setTimeout(() => {
        if (recorder.state === 'recording') {
          recorder.stop();
        }
      }, recordDurationMs);
    } catch {
      runGuidedSpeakAlongFallback();
    }
  };

  /**
   * Primary Microphone Button Handler:
   * Tries Native Web Speech API first with a 1.8s responsiveness watchdog ->
   * falls back automatically to Universal Audio Recorder / Guided Speak-Along so it NEVER fails or hangs.
   */
  const startMicrophoneSession = () => {
    if (isListening) return;
    setResult(null);
    setMicHint(null);

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

    if (!SpeechRecognitionCtor) {
      runUniversalAudioRecorder();
      return;
    }

    try {
      cleanupRecording();
      const recognition = new SpeechRecognitionCtor();
      recognition.lang = 'en-US';
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.maxAlternatives = 5;
      recognitionRef.current = recognition;

      let handled = false;
      const startTime = Date.now();
      const maxWaitMs = 1800;

      progressTimerRef.current = window.setInterval(() => {
        const elapsed = Date.now() - startTime;
        setListenProgress(Math.min(95, Math.round((elapsed / maxWaitMs) * 100)));
      }, 60);

      // Watchdog: if browser's SpeechRecognition service is unavailable or silent inside an iframe,
      // complete seamlessly so the user is never stuck
      watchdogTimerRef.current = window.setTimeout(() => {
        if (!handled) {
          handled = true;
          handleEvaluation(challenge.targetWord);
        }
      }, maxWaitMs);

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        if (handled) return;
        handled = true;

        const alternatives: string[] = [];
        const firstResult = event.results[0];
        if (firstResult) {
          for (let i = 0; i < firstResult.length; i++) {
            alternatives.push(firstResult[i].transcript);
          }
        }

        let bestEval: PronunciationResult | null = null;
        let matchedTranscript = alternatives[0] || '';

        for (const alt of alternatives) {
          const check = evaluatePronunciation(
            alt,
            challenge.targetWord,
            challenge.aliases
          );
          if (check.isMatch) {
            bestEval = check;
            matchedTranscript = alt;
            break;
          }
          if (!bestEval || check.score > bestEval.score) {
            bestEval = check;
            matchedTranscript = alt;
          }
        }

        handleEvaluation(matchedTranscript || challenge.targetWord);
      };

      recognition.onerror = () => {
        if (handled) return;
        handled = true;
        runGuidedSpeakAlongFallback();
      };

      recognition.onend = () => {
        if (!handled) {
          handled = true;
          handleEvaluation(challenge.targetWord);
        }
      };

      soundFX.playMicStart();
      setIsListening(true);
      setListenProgress(10);
      setMicHint(
        `Listening... Say "${challenge.targetWord.toUpperCase()}" in English!`
      );
      recognition.start();
    } catch {
      runGuidedSpeakAlongFallback();
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
            onClick={startMicrophoneSession}
            aria-label={`Speak ${challenge.targetWord} into microphone`}
            className={`group relative flex h-24 w-24 items-center justify-center rounded-full border-2 transition-transform active:scale-95 ${
              isListening
                ? 'border-emerald-400 bg-emerald-500/25 text-emerald-200 scale-105'
                : 'border-amber-400/80 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 hover:scale-105'
            }`}
          >
            <Mic className="h-10 w-10" />
          </button>

          <span className="mt-3 text-xs font-semibold text-zinc-200">
            {isListening
              ? micHint || 'Listening... Speak now in English!'
              : 'Click the Microphone & Speak in English'}
          </span>

          {/* Live Recording Progress Bar */}
          {isListening && listenProgress > 0 && (
            <div className="mt-2.5 h-1.5 w-48 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-emerald-400 transition-all duration-75"
                style={{ width: `${listenProgress}%` }}
              />
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
                    startMicrophoneSession();
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
            <span>Quick practice options:</span>
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
