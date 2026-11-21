import { useEffect, useRef, useState } from 'react';

interface Recognition {
  lang: string;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

const speechWindow = window as Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};

export function useChatSpeech(appendTranscript: (text: string) => void, successMessage = 'Dictation added. Review your message before sending.') {
  const Recognizer = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
  const canSpeak = 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  const recognition = useRef<Recognition>();
  const utterance = useRef<SpeechSynthesisUtterance>();
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState<number>();
  const [voiceStatus, setVoiceStatus] = useState('');

  useEffect(() => () => {
    const active = recognition.current;
    recognition.current = undefined;
    active?.abort();
    if (utterance.current) {
      utterance.current = undefined;
      window.speechSynthesis.cancel();
    }
  }, []);

  function toggleDictation(language: string) {
    if (!Recognizer) return;
    if (recognition.current) {
      recognition.current.stop();
      return;
    }

    const session = new Recognizer();
    session.lang = language === 'auto' ? 'en-IN' : language;
    session.onresult = event => {
      if (recognition.current !== session) return;
      const transcript = Array.from(event.results, result => result[0]?.transcript ?? '').join(' ').trim();
      if (transcript) {
        appendTranscript(transcript);
        setVoiceStatus(successMessage);
      }
    };
    session.onerror = ({ error }) => {
      if (recognition.current !== session) return;
      recognition.current = undefined;
      setListening(false);
      const denied = error === 'not-allowed' || error === 'service-not-allowed';
      setVoiceStatus(denied ? 'Allow microphone access in your browser settings, or type your message.'
        : error === 'no-speech' ? 'No speech detected. Try again or type your message.'
        : 'Dictation is unavailable right now. Try again or type your message.');
    };
    session.onend = () => {
      if (recognition.current !== session) return;
      recognition.current = undefined;
      setListening(false);
      setVoiceStatus(current => current === 'Listening…' ? 'Dictation stopped.' : current);
    };
    recognition.current = session;
    try {
      session.start();
      setListening(true);
      setVoiceStatus('Listening…');
    } catch {
      recognition.current = undefined;
      setVoiceStatus('Could not start dictation. You can still type your message.');
    }
  }

  function toggleReadAloud(index: number, text: string, language: string) {
    if (!canSpeak) return;
    if (utterance.current) {
      utterance.current = undefined;
      window.speechSynthesis.cancel();
    }
    setSpeaking(undefined);
    if (speaking === index) return;

    const next = new SpeechSynthesisUtterance(text);
    next.lang = language;
    next.onend = () => {
      if (utterance.current !== next) return;
      utterance.current = undefined;
      setSpeaking(undefined);
    };
    next.onerror = () => {
      if (utterance.current !== next) return;
      utterance.current = undefined;
      setSpeaking(undefined);
      setVoiceStatus('Read aloud is unavailable on this device.');
    };
    utterance.current = next;
    setSpeaking(index);
    setVoiceStatus('');
    window.speechSynthesis.speak(next);
  }

  return { canDictate: Boolean(Recognizer), canSpeak, listening, speaking, voiceStatus, toggleDictation, toggleReadAloud };
}
