import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { pipeline, env } from '@huggingface/transformers';

env.cacheDir = './.whisper-cache';

type AsrPipeline = (
  audio: Float32Array,
  options?: Record<string, unknown>
) => Promise<{ text?: string } | Array<{ text?: string }>>;

let transcriberPromise: Promise<AsrPipeline> | null = null;

function getWhisperTranscriber(): Promise<AsrPipeline> {
  if (!transcriberPromise) {
    transcriberPromise = pipeline(
      'automatic-speech-recognition',
      'Xenova/whisper-tiny.en',
      { dtype: 'q8' }
    ) as unknown as Promise<AsrPipeline>;
  }
  return transcriberPromise;
}

// Pre-warm the local Whisper English speech recognition model on server boot
getWhisperTranscriber()
  .then(() => {
    console.log('Local Whisper tiny.en ASR model ready.');
  })
  .catch((err) => {
    console.error('Failed to pre-warm Whisper ASR model:', err);
  });

function cleanWhisperTranscript(raw: string): string {
  return raw
    .replace(/\[.*?\]/g, ' ')
    .replace(/\(.*?\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '15mb' }));

  /**
   * Real Speech-to-Text endpoint using local Whisper tiny.en on 16kHz PCM audio.
   * Never returns the targetWord as a fake fallback — always transcribes what was actually spoken.
   */
  app.post('/api/transcribe', async (req, res) => {
    try {
      const { pcmBase64 } = req.body as {
        pcmBase64?: string;
      };

      if (!pcmBase64) {
        res.status(400).json({ error: 'Missing pcmBase64 audio data' });
        return;
      }

      const buf = Buffer.from(pcmBase64, 'base64');
      const sampleCount = Math.floor(buf.byteLength / 2);
      if (sampleCount < 1600) {
        res.json({ transcript: '' });
        return;
      }

      const float32Audio = new Float32Array(sampleCount);
      let peak = 0;
      for (let i = 0; i < sampleCount; i++) {
        const sample = buf.readInt16LE(i * 2) / 32768;
        float32Audio[i] = sample;
        const abs = Math.abs(sample);
        if (abs > peak) peak = abs;
      }

      // Normalize audio peak to 0.85 for crisp Whisper recognition
      if (peak > 0.01 && peak < 0.85) {
        const gain = 0.85 / peak;
        for (let i = 0; i < sampleCount; i++) {
          float32Audio[i] = Math.max(-1, Math.min(1, float32Audio[i] * gain));
        }
      }

      const transcriber = await getWhisperTranscriber();
      const result = await transcriber(float32Audio);
      const rawText = Array.isArray(result)
        ? result[0]?.text || ''
        : result?.text || '';
      const transcript = cleanWhisperTranscript(rawText);

      res.json({ transcript });
    } catch (error) {
      console.error('ASR Transcription error:', error);
      res.status(500).json({
        error: 'Failed to transcribe audio',
        transcript: '',
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`English Kitchen server running on http://localhost:${PORT}`);
  });
}

startServer();
