import { Platform } from 'react-native';
import * as Speech from 'expo-speech';
import type { TTSSettings, TTSVoice } from '@folium/shared';
import { getDatabase } from '../db';

const TTS_SETTINGS_KEY = 'tts_settings';

export const DEFAULT_TTS_SETTINGS: TTSSettings = {
  voiceURI: undefined,
  rate: 1.0,
  pitch: 1.0,
  autoNext: true,
};

/**
 * Splits plain text or book excerpts into clean, speakable sentence chunks.
 * Handles abbreviations, decimal numbers, quotes, and punctuation in Vietnamese and international text.
 */
export function splitTextIntoSentences(text: string): string[] {
  if (!text || typeof text !== 'string') return [];

  // Normalize whitespace and remove HTML tags if present
  const cleaned = text
    .replace(/<[^>]+>/g, ' ')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return [];

  // Honorifics and title prefixes that precede capitalized names
  const TITLE_ABBREVS = [
    'mr', 'mrs', 'ms', 'dr', 'prof', 'tp', 'ths', 'bs', 'ts', 'gs', 'th',
    'vs', 'đ/c', 'đc'
  ];

  let tokenized = cleaned;
  TITLE_ABBREVS.forEach((abbr) => {
    const escaped = abbr.replace(/\\./g, '\\.');
    const regex = new RegExp(`(\\b${escaped})\\.`, 'gi');
    tokenized = tokenized.replace(regex, (_match, p1) => `${p1}__ABBRDOT__`);
  });

  // Protect decimal numbers (e.g. 3.14 or 10.000)
  tokenized = tokenized.replace(/(\d+)\.(\d+)/g, '$1__DOT__$2');

  // Split on sentence boundaries: [.!?…]+ followed by space or quotation
  const rawChunks = tokenized.split(/(?<=[.!?…])\s+(?=[A-ZÀ-Ỹ0-9"“«])/u);

  const result: string[] = [];
  for (const chunk of rawChunks) {
    let restored = chunk.trim();
    restored = restored.replace(/__ABBRDOT__/g, '.');
    restored = restored.replace(/__DOT__/g, '.');
    if (restored.length > 0) {
      result.push(restored);
    }
  }

  // Safety fallback: if a sentence is excessively long (>350 chars), break by sub-clauses
  const finalSentences: string[] = [];
  for (const sentence of result) {
    if (sentence.length > 350) {
      const subChunks = sentence.split(/(?<=[,;:\n])\s+/);
      const validSub = subChunks.filter((s) => s.trim().length > 0);
      if (validSub.length > 0) {
        finalSentences.push(...validSub);
      } else {
        finalSentences.push(sentence);
      }
    } else {
      finalSentences.push(sentence);
    }
  }

  return finalSentences.length > 0 ? finalSentences : [cleaned];
}

/**
 * Retrieves the list of available TTS voices across Web and Native.
 */
export async function getAvailableTTSVoices(): Promise<TTSVoice[]> {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return [];
    }

    const synth = window.speechSynthesis;
    let rawVoices = synth.getVoices();

    if (rawVoices.length === 0) {
      // Chrome/Edge load voices asynchronously
      await new Promise<void>((resolve) => {
        const handler = () => {
          synth.removeEventListener('voiceschanged', handler);
          resolve();
        };
        synth.addEventListener('voiceschanged', handler);
        // Timeout safeguard
        setTimeout(resolve, 600);
      });
      rawVoices = synth.getVoices();
    }

    return rawVoices.map((v) => ({
      identifier: v.voiceURI,
      name: v.name,
      language: v.lang,
      quality: v.default ? 'default' : undefined,
    }));
  }

  // Native iOS / Android via expo-speech
  try {
    const nativeVoices = await Speech.getAvailableVoicesAsync();
    return nativeVoices.map((v) => ({
      identifier: v.identifier,
      name: v.name,
      language: v.language,
      quality: v.quality,
    }));
  } catch (err) {
    console.warn('[TTS] Failed to get native voices:', err);
    return [];
  }
}

/**
 * Categorizes and sorts voices, placing voices matching the preferred language first.
 */
export function sortAndFilterVoices(
  voices: TTSVoice[],
  preferredLocale: string = 'vi'
): { recommended: TTSVoice[]; others: TTSVoice[] } {
  const normPref = preferredLocale.toLowerCase().slice(0, 2);

  const recommended: TTSVoice[] = [];
  const others: TTSVoice[] = [];

  for (const voice of voices) {
    const lang = voice.language.toLowerCase();
    if (lang.startsWith(normPref) || (normPref === 'vi' && lang.includes('vi'))) {
      recommended.push(voice);
    } else {
      others.push(voice);
    }
  }

  // Sort alphabetically by name
  recommended.sort((a, b) => a.name.localeCompare(b.name));
  others.sort((a, b) => a.language.localeCompare(b.language) || a.name.localeCompare(b.name));

  return { recommended, others };
}

/**
 * Load TTS settings from SQLite sync_meta
 */
export async function loadTTSSettings(): Promise<TTSSettings> {
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ value: string }>(
      'SELECT value FROM sync_meta WHERE key = ?',
      [TTS_SETTINGS_KEY]
    );
    if (row?.value) {
      return { ...DEFAULT_TTS_SETTINGS, ...JSON.parse(row.value) };
    }
  } catch (err) {
    console.warn('[TTS] Failed to load settings from SQLite:', err);
  }
  return DEFAULT_TTS_SETTINGS;
}

/**
 * Save TTS settings to SQLite sync_meta
 */
export async function saveTTSSettings(settings: TTSSettings): Promise<void> {
  try {
    const db = await getDatabase();
    await db.runAsync(
      'INSERT INTO sync_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      [TTS_SETTINGS_KEY, JSON.stringify(settings)]
    );
  } catch (err) {
    console.warn('[TTS] Failed to save settings to SQLite:', err);
  }
}

// Web Chrome 15s keepalive timer
let webKeepAliveInterval: any = null;

function startWebKeepAlive() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  stopWebKeepAlive();
  webKeepAliveInterval = setInterval(() => {
    if (window.speechSynthesis && window.speechSynthesis.speaking) {
      window.speechSynthesis.pause();
      window.speechSynthesis.resume();
    } else {
      stopWebKeepAlive();
    }
  }, 10000);
}

function stopWebKeepAlive() {
  if (webKeepAliveInterval) {
    clearInterval(webKeepAliveInterval);
    webKeepAliveInterval = null;
  }
}

export interface SpeakOptions {
  voiceURI?: string;
  rate?: number;
  pitch?: number;
  language?: string;
  onDone?: () => void;
  onError?: (err: any) => void;
  onStopped?: () => void;
}

/**
 * Speaks a single sentence or chunk.
 */
export function speakText(text: string, options: SpeakOptions = {}): void {
  stopSpeaking();

  if (!text || !text.trim()) {
    options.onDone?.();
    return;
  }

  const {
    voiceURI,
    rate = 1.0,
    pitch = 1.0,
    language,
    onDone,
    onError,
    onStopped,
  } = options;

  if (Platform.OS === 'web') {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      onError?.(new Error('Web Speech Synthesis is not supported on this browser.'));
      return;
    }

    const synth = window.speechSynthesis;
    const utterance = new SpeechSynthesisUtterance(text);

    utterance.rate = Math.max(0.5, Math.min(2.0, rate));
    utterance.pitch = Math.max(0.8, Math.min(1.5, pitch));

    if (language) {
      utterance.lang = language;
    }

    if (voiceURI) {
      const voices = synth.getVoices();
      const match = voices.find((v) => v.voiceURI === voiceURI);
      if (match) {
        utterance.voice = match;
        utterance.lang = match.lang;
      }
    } else if (!language) {
      // Default to Vietnamese if available, or browser default
      const voices = synth.getVoices();
      const viVoice = voices.find((v) => v.lang.startsWith('vi'));
      if (viVoice) {
        utterance.voice = viVoice;
        utterance.lang = viVoice.lang;
      }
    }

    utterance.onend = () => {
      stopWebKeepAlive();
      onDone?.();
    };

    utterance.onerror = (e) => {
      stopWebKeepAlive();
      if (e.error === 'interrupted' || e.error === 'canceled') {
        onStopped?.();
      } else {
        onError?.(e);
      }
    };

    startWebKeepAlive();
    synth.speak(utterance);
    return;
  }

  // Native Speech
  try {
    Speech.speak(text, {
      voice: voiceURI,
      rate: Math.max(0.5, Math.min(2.0, rate)),
      pitch: Math.max(0.8, Math.min(1.5, pitch)),
      language: language,
      onDone: () => onDone?.(),
      onError: (err) => onError?.(err),
      onStopped: () => onStopped?.(),
    });
  } catch (err) {
    onError?.(err);
  }
}

/**
 * Stops any ongoing speech.
 */
export function stopSpeaking(): void {
  if (Platform.OS === 'web') {
    stopWebKeepAlive();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    return;
  }

  try {
    Speech.stop();
  } catch {}
}

/**
 * Pauses ongoing speech.
 */
export function pauseSpeaking(): void {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.pause();
    }
    return;
  }

  try {
    Speech.pause();
  } catch {}
}

/**
 * Resumes paused speech.
 */
export function resumeSpeaking(): void {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.resume();
    }
    return;
  }

  try {
    Speech.resume();
  } catch {}
}
