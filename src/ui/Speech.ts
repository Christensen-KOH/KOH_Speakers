/**
 * Thin wrapper over the Web Speech API for pronunciation. Silently does
 * nothing where speechSynthesis is unavailable.
 */
export class Speech {
  public isSupported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  public speak(text: string, rate = 0.9): void {
    if (!this.isSupported() || text.trim() === '') {
      return;
    }

    const synth = window.speechSynthesis;
    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.rate = rate;

    // Voices load asynchronously; use an English one when available.
    const voice = synth
      .getVoices()
      .find((candidate) => candidate.lang.toLowerCase().startsWith('en'));
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    }

    synth.speak(utterance);
  }

  public cancel(): void {
    if (this.isSupported()) {
      window.speechSynthesis.cancel();
    }
  }
}
