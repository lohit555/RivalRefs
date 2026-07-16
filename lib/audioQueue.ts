export interface QueueItem {
  audioUrl?: string;
  onStart?: () => void;
  onEnd?: () => void;
}

/**
 * Plays audio items strictly one at a time. If an item has no audioUrl
 * (TTS failed), it "plays" for a short fixed duration so the transcript
 * still advances and the demo never stalls waiting on missing audio.
 */
export class AudioQueue {
  private queue: QueueItem[] = [];
  private playing = false;
  private currentAudio: HTMLAudioElement | null = null;
  private stopped = false;

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
      if (item.audioUrl) {
        await this.playAudioUrl(item.audioUrl);
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

  private playAudioUrl(url: string): Promise<void> {
    return new Promise((resolve) => {
      const audio = new Audio(url);
      this.currentAudio = audio;

      const cleanup = () => {
        audio.removeEventListener("ended", onEnded);
        audio.removeEventListener("error", onError);
        if (this.currentAudio === audio) {
          this.currentAudio = null;
        }
      };

      const onEnded = () => {
        cleanup();
        resolve();
      };

      const onError = () => {
        cleanup();
        resolve();
      };

      audio.addEventListener("ended", onEnded);
      audio.addEventListener("error", onError);

      audio.play().catch(() => {
        cleanup();
        resolve();
      });
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
    this.currentAudio?.pause();
  }

  resume() {
    this.currentAudio?.play().catch(() => {});
  }

  clear() {
    this.stopped = true;
    this.queue = [];
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }
    this.playing = false;
  }

  reset() {
    this.stopped = false;
  }

  isPlaying() {
    return this.playing;
  }
}
