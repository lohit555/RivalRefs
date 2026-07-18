import { isSpeechSupported } from "./speech";
import type { SpeakerVoiceProfile } from "./speech";

export interface QueueItem {
  text: string;
  voiceProfile: SpeakerVoiceProfile | null;
  onStart?: () => void;
  onEnd?: () => void;
}

/**
 * Speaks items strictly one at a time via the browser's Web Speech API.
 * If speech synthesis isn't supported, an item "plays" for a short fixed
 * duration so the transcript still advances and the demo never stalls.
 */
export class AudioQueue {
  private queue: QueueItem[] = [];
  private playing = false;
  private stopped = false;
  private supported = isSpeechSupported();

  enqueue(item: QueueItem) {
    this.queue.push(item);
    if (!this.playing) {
      void this.playNext();
    }
  }

  private async playNext() {
    if (this.stopped) return;
    const item = this.queue.shift();
    if (!item) {
      this.playing = false;
      return;
    }

    this.playing = true;
    item.onStart?.();

    try {
      if (this.supported) {
        await this.speak(item);
      } else {
        await this.wait(1400);
      }
    } catch {
      // Swallow playback errors — treat as a silent line and move on.
    }

    item.onEnd?.();

    if (!this.stopped) {
      void this.playNext();
    } else {
      this.playing = false;
    }
  }

  private speak(item: QueueItem): Promise<void> {
    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(item.text);
      if (item.voiceProfile?.voice) {
        utterance.voice = item.voiceProfile.voice;
      }
      utterance.pitch = item.voiceProfile?.pitch ?? 1;
      utterance.rate = item.voiceProfile?.rate ?? 1;

      const cleanup = () => {
        utterance.removeEventListener("end", onEnd);
        utterance.removeEventListener("error", onError);
      };
      const onEnd = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        resolve();
      };

      utterance.addEventListener("end", onEnd);
      utterance.addEventListener("error", onError);

      window.speechSynthesis.speak(utterance);
    });
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timeout = setTimeout(resolve, ms);
      if (this.stopped) {
        clearTimeout(timeout);
        resolve();
      }
    });
  }

  pause() {
    if (this.supported) window.speechSynthesis.pause();
  }

  resume() {
    if (this.supported) window.speechSynthesis.resume();
  }

  clear() {
    this.stopped = true;
    this.queue = [];
    if (this.supported) window.speechSynthesis.cancel();
    this.playing = false;
  }

  reset() {
    this.stopped = false;
  }

  isPlaying() {
    return this.playing;
  }
}
