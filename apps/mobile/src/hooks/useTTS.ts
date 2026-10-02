import { useState, useEffect, useRef, useCallback } from 'react';
import type { TTSSettings, TTSVoice } from '@folium/shared';
import {
  getAvailableTTSVoices,
  loadTTSSettings,
  saveTTSSettings,
  speakText,
  stopSpeaking,
  pauseSpeaking,
  resumeSpeaking,
  splitTextIntoSentences,
  DEFAULT_TTS_SETTINGS,
} from '../services/ttsService';

export interface UseTTSOptions {
  onSentenceChange?: (index: number, sentence: string) => void;
  onFinish?: () => void;
}

export function useTTS(options: UseTTSOptions = {}) {
  const [voices, setVoices] = useState<TTSVoice[]>([]);
  const [settings, setSettings] = useState<TTSSettings>(DEFAULT_TTS_SETTINGS);
  const [sentences, setSentences] = useState<string[]>([]);
  const [currentSentenceIndex, setCurrentSentenceIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);

  const sentencesRef = useRef<string[]>([]);
  sentencesRef.current = sentences;

  const currentIndexRef = useRef<number>(0);
  currentIndexRef.current = currentSentenceIndex;

  const settingsRef = useRef<TTSSettings>(settings);
  settingsRef.current = settings;

  const isPlayingRef = useRef<boolean>(false);
  isPlayingRef.current = isPlaying;

  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Load voices and persisted settings on mount
  useEffect(() => {
    let mounted = true;

    async function init() {
      const [loadedVoices, loadedSettings] = await Promise.all([
        getAvailableTTSVoices(),
        loadTTSSettings(),
      ]);

      if (mounted) {
        setVoices(loadedVoices);
        setSettings(loadedSettings);
      }
    }

    init();

    return () => {
      mounted = false;
      stopSpeaking();
    };
  }, []);

  const updateSettings = useCallback(async (partial: Partial<TTSSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      saveTTSSettings(next);
      return next;
    });
  }, []);

  const speakSentenceAtIndex = useCallback((index: number) => {
    const list = sentencesRef.current;
    if (index < 0 || index >= list.length) {
      setIsPlaying(false);
      setIsPaused(false);
      optionsRef.current.onFinish?.();
      return;
    }

    setCurrentSentenceIndex(index);
    setIsPlaying(true);
    setIsPaused(false);

    const sentence = list[index];
    optionsRef.current.onSentenceChange?.(index, sentence);

    speakText(sentence, {
      voiceURI: settingsRef.current.voiceURI,
      rate: settingsRef.current.rate,
      pitch: settingsRef.current.pitch,
      onDone: () => {
        if (!isPlayingRef.current) return;

        if (settingsRef.current.autoNext && index + 1 < sentencesRef.current.length) {
          speakSentenceAtIndex(index + 1);
        } else {
          setIsPlaying(false);
          setIsPaused(false);
          optionsRef.current.onFinish?.();
        }
      },
      onError: (err) => {
        console.warn('[useTTS] speak error:', err);
        setIsPlaying(false);
        setIsPaused(false);
      },
      onStopped: () => {
        // Handled via state transitions
      },
    });
  }, []);

  const loadText = useCallback((text: string) => {
    stopSpeaking();
    setIsPlaying(false);
    setIsPaused(false);
    const chunked = splitTextIntoSentences(text);
    setSentences(chunked);
    setCurrentSentenceIndex(0);
    return chunked;
  }, []);

  const play = useCallback(
    (index?: number) => {
      const target = typeof index === 'number' ? index : currentIndexRef.current;
      speakSentenceAtIndex(target);
    },
    [speakSentenceAtIndex]
  );

  const pause = useCallback(() => {
    pauseSpeaking();
    setIsPaused(true);
  }, []);

  const resume = useCallback(() => {
    resumeSpeaking();
    setIsPaused(false);
  }, []);

  const stop = useCallback(() => {
    stopSpeaking();
    setIsPlaying(false);
    setIsPaused(false);
  }, []);

  const nextSentence = useCallback(() => {
    const nextIdx = currentIndexRef.current + 1;
    if (nextIdx < sentencesRef.current.length) {
      if (isPlayingRef.current) {
        speakSentenceAtIndex(nextIdx);
      } else {
        setCurrentSentenceIndex(nextIdx);
      }
    }
  }, [speakSentenceAtIndex]);

  const prevSentence = useCallback(() => {
    const prevIdx = Math.max(0, currentIndexRef.current - 1);
    if (isPlayingRef.current) {
      speakSentenceAtIndex(prevIdx);
    } else {
      setCurrentSentenceIndex(prevIdx);
    }
  }, [speakSentenceAtIndex]);

  const seekSentence = useCallback(
    (index: number) => {
      if (index >= 0 && index < sentencesRef.current.length) {
        if (isPlayingRef.current) {
          speakSentenceAtIndex(index);
        } else {
          setCurrentSentenceIndex(index);
        }
      }
    },
    [speakSentenceAtIndex]
  );

  const testVoice = useCallback(
    (voiceURI: string, sampleText: string = 'Xin chào, đây là giọng đọc sách của Folium.') => {
      stopSpeaking();
      setIsPlaying(false);
      setIsPaused(false);

      speakText(sampleText, {
        voiceURI,
        rate: settingsRef.current.rate,
        pitch: settingsRef.current.pitch,
      });
    },
    []
  );

  return {
    voices,
    settings,
    sentences,
    currentSentenceIndex,
    currentSentence: sentences[currentSentenceIndex] || '',
    isPlaying,
    isPaused,
    updateSettings,
    loadText,
    play,
    pause,
    resume,
    stop,
    nextSentence,
    prevSentence,
    seekSentence,
    testVoice,
  };
}
