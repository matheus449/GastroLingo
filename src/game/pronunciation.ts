export interface PronunciationResult {
  isMatch: boolean;
  score: number; // 0 to 100
  normalizedSpoken: string;
  normalizedTarget: string;
  distance: number;
  feedbackEn: string;
  feedbackPt: string;
}

/**
 * Normalizes a string for English speech comparison:
 * lowercase, strips punctuation, collapses whitespace.
 */
export function normalizeSpeechText(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Computes standard Levenshtein edit distance between two strings.
 */
export function levenshteinDistance(a: string, b: string): number {
  const s = a.toLowerCase();
  const t = b.toLowerCase();

  if (s === t) return 0;
  if (s.length === 0) return t.length;
  if (t.length === 0) return s.length;

  const rows = s.length + 1;
  const cols = t.length + 1;
  const dp: number[][] = Array.from({ length: rows }, () =>
    new Array<number>(cols).fill(0)
  );

  for (let i = 0; i < rows; i++) dp[i][0] = i;
  for (let j = 0; j < cols; j++) dp[0][j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1, // deletion
        dp[i][j - 1] + 1, // insertion
        dp[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return dp[s.length][t.length];
}

/**
 * Generates a simplified phonetic skeleton for accent-friendly comparison
 * while preserving distinct word identities (so "potato" never matches "tomato").
 */
export function phoneticSkeleton(word: string): string {
  return word
    .toLowerCase()
    .replace(/ph/g, 'f')
    .replace(/sh/g, 's')
    .replace(/ch/g, 'c')
    .replace(/th/g, 't')
    .replace(/ck/g, 'k')
    .replace(/oo/g, 'u')
    .replace(/ee/g, 'i')
    .replace(/ea/g, 'i')
    .replace(/([a-z])\1+/g, '$1') // collapse double letters like tt, ll, pp
    .replace(/e$/g, ''); // silent trailing e
}

/**
 * Evaluates a spoken transcript against a target word and optional aliases.
 * Rules:
 * 1. Empty or silent input -> always false.
 * 2. Exact token match on target word or aliases -> 100% match.
 * 3. Accent tolerance: token starts with the same initial sound/letter AND
 *    has Levenshtein distance <= 1 (or <= 2 for words >= 8 chars).
 */
export function evaluatePronunciation(
  spokenRaw: string,
  targetRaw: string,
  aliases: string[] = []
): PronunciationResult {
  const normalizedSpoken = normalizeSpeechText(spokenRaw);
  const normalizedTarget = normalizeSpeechText(targetRaw);

  if (!normalizedSpoken) {
    return {
      isMatch: false,
      score: 0,
      normalizedSpoken: '',
      normalizedTarget,
      distance: normalizedTarget.length,
      feedbackEn:
        'No clear voice detected. Speak the word aloud near your microphone!',
      feedbackPt:
        'Nenhuma fala clara detectada. Fale a palavra em voz alta perto do microfone!',
    };
  }

  const candidateTargets = [
    normalizedTarget,
    ...aliases.map((a) => normalizeSpeechText(a)).filter(Boolean),
  ];

  const spokenTokens = normalizedSpoken.split(' ').filter(Boolean);

  // 1. Exact phrase or exact word-token match against target or known phonetic aliases
  for (const candidate of candidateTargets) {
    if (
      normalizedSpoken === candidate ||
      spokenTokens.includes(candidate) ||
      (candidate.includes(' ') && normalizedSpoken.includes(candidate))
    ) {
      return {
        isMatch: true,
        score: 100,
        normalizedSpoken,
        normalizedTarget,
        distance: 0,
        feedbackEn: `Perfect! Heard "${spokenRaw.trim()}" — "${targetRaw.toUpperCase()}" pronounced clearly!`,
        feedbackPt: `Perfeito! Ouvimos "${spokenRaw.trim()}" — pronúncia correta!`,
      };
    }
  }

  // 2. Compare word tokens & full phrase via strict initial-sound + Levenshtein tolerance
  const comparisonPool = [normalizedSpoken, ...spokenTokens];

  let bestDistance = Infinity;
  let bestScore = 0;
  let matchedByTolerance = false;

  for (const candidate of candidateTargets) {
    const maxAllowedDistance = candidate.length >= 8 ? 2 : 1;
    const candidatePhonetic = phoneticSkeleton(candidate);

    for (const token of comparisonPool) {
      if (token.length < 2) continue;

      const dist = levenshteinDistance(token, candidate);
      const maxLen = Math.max(token.length, candidate.length, 1);
      const similarity = Math.max(0, Math.round((1 - dist / maxLen) * 100));

      if (dist < bestDistance) {
        bestDistance = dist;
      }
      if (similarity > bestScore) {
        bestScore = similarity;
      }

      // Require matching initial sound so "potato" != "tomato" and "bread" != "head"
      const tokenPhonetic = phoneticSkeleton(token);
      const sameInitial =
        token[0] === candidate[0] ||
        tokenPhonetic[0] === candidatePhonetic[0];

      if (sameInitial && dist <= maxAllowedDistance) {
        matchedByTolerance = true;
      }

      // Check phonetic skeleton tolerance (only when initial sound matches)
      const phoneticDist = levenshteinDistance(tokenPhonetic, candidatePhonetic);
      if (
        sameInitial &&
        phoneticDist <= 1 &&
        candidatePhonetic.length >= 4 &&
        Math.abs(token.length - candidate.length) <= 2
      ) {
        matchedByTolerance = true;
        bestScore = Math.max(bestScore, 88);
        bestDistance = Math.min(bestDistance, 1);
      }
    }
  }

  if (matchedByTolerance) {
    return {
      isMatch: true,
      score: Math.max(bestScore, 84),
      normalizedSpoken,
      normalizedTarget,
      distance: bestDistance,
      feedbackEn: `Great job! Heard "${spokenRaw.trim()}" — matches ${targetRaw.toUpperCase()}!`,
      feedbackPt: `Muito bom! Ouvimos "${spokenRaw.trim()}" — pronúncia validada!`,
    };
  }

  return {
    isMatch: false,
    score: bestScore,
    normalizedSpoken,
    normalizedTarget,
    distance: bestDistance,
    feedbackEn: `Try again! Heard "${spokenRaw.trim()}", expected "${targetRaw.toUpperCase()}".`,
    feedbackPt: `Tente novamente! Ouvimos "${spokenRaw.trim()}", mas a palavra correta é "${targetRaw.toUpperCase()}".`,
  };
}
