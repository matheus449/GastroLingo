import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  app.post('/api/transcribe', async (req, res) => {
    try {
      const { audioBase64, mimeType, targetWord } = req.body as {
        audioBase64?: string;
        mimeType?: string;
        targetWord?: string;
      };

      if (!audioBase64) {
        res.status(400).json({ error: 'Missing audioBase64 payload' });
        return;
      }

      const apiKey = process.env.GEMINI_API_KEY;
      if (
        !apiKey ||
        apiKey === 'MY_GEMINI_API_KEY' ||
        apiKey.trim().length < 10
      ) {
        res.status(200).json({
          transcript: targetWord || '',
          fallbackUsed: true,
        });
        return;
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const audioPart = {
        inlineData: {
          mimeType: mimeType || 'audio/webm',
          data: audioBase64,
        },
      };

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-transcribe',
        contents: {
          parts: [
            audioPart,
            {
              text: `Transcribe the spoken English word or phrase in this audio. Output ONLY the transcribed English words, nothing else.`,
            },
          ],
        },
      });

      const transcript = (response.text ?? '').trim();
      res.json({
        transcript: transcript || targetWord || '',
        fallbackUsed: !transcript,
      });
    } catch (error) {
      console.error('Transcription fallback triggered:', error);
      const fallbackWord =
        (req.body && typeof req.body.targetWord === 'string'
          ? req.body.targetWord
          : '') || '';
      res.status(200).json({
        transcript: fallbackWord,
        fallbackUsed: true,
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
