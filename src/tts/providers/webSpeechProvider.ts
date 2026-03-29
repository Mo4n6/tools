import { TTSProvider, TTSSegment, TTSSynthesisOptions, TTSSynthesisResult, TTSVoice } from '../types';

const isSpeechSynthesisSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

export class WebSpeechProvider implements TTSProvider {
  async warmup(): Promise<void> {
    if (!isSpeechSynthesisSupported()) {
      throw new Error('Web Speech API is not supported in this browser.');
    }

    await this.listVoices();
  }

  async listVoices(): Promise<TTSVoice[]> {
    if (!isSpeechSynthesisSupported()) {
      return [];
    }

    const synth = window.speechSynthesis;
    const existing = synth.getVoices();

    if (existing.length > 0) {
      return existing.map((voice) => ({
        id: voice.voiceURI,
        name: voice.name,
        language: voice.lang,
        provider: 'web-speech',
      }));
    }

    return new Promise<TTSVoice[]>((resolve) => {
      const handleVoices = () => {
        synth.removeEventListener('voiceschanged', handleVoices);
        resolve(
          synth.getVoices().map((voice) => ({
            id: voice.voiceURI,
            name: voice.name,
            language: voice.lang,
            provider: 'web-speech',
          }))
        );
      };

      synth.addEventListener('voiceschanged', handleVoices);
    });
  }

  async synthesize(segment: TTSSegment, _options: TTSSynthesisOptions = {}): Promise<TTSSynthesisResult> {
    if (!isSpeechSynthesisSupported()) {
      throw new Error('Web Speech API is not supported in this browser.');
    }

    return {
      segmentId: segment.id,
      mode: 'native-spoken',
    };
  }

  async playNative(segment: TTSSegment, options: TTSSynthesisOptions = {}): Promise<void> {
    if (!isSpeechSynthesisSupported()) {
      throw new Error('Web Speech API is not supported in this browser.');
    }

    const utterance = new SpeechSynthesisUtterance(segment.text);
    utterance.rate = options.rate ?? 1;
    utterance.pitch = options.pitch ?? 1;

    const voices = await this.listVoices();
    const selectedVoice = voices.find((voice) => voice.id === options.voice);
    if (selectedVoice) {
      const nativeVoice = window.speechSynthesis.getVoices().find((voice) => voice.voiceURI === selectedVoice.id);
      if (nativeVoice) {
        utterance.voice = nativeVoice;
      }
    }

    await new Promise<void>((resolve, reject) => {
      utterance.onend = () => resolve();
      utterance.onerror = (event) => reject(event.error);
      window.speechSynthesis.speak(utterance);
    });

    return;
  }
}
