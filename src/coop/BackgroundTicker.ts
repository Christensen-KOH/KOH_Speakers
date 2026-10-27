// Browsers stop requestAnimationFrame in hidden or occluded windows (and
// don't always report it through document.hidden). The host's battlefield
// must keep running for every student even then, so a Web Worker (whose
// messages aren't throttled like page timers) supplies ticks whenever the
// normal frame loop has stalled.

const WORKER_SOURCE = `
  let timer = null;
  onmessage = (event) => {
    clearInterval(timer);
    if (event.data > 0) {
      timer = setInterval(() => postMessage(0), event.data);
    }
  };
`;

// Frames older than this count as stalled.
const STALL_MS = 250;

export class BackgroundTicker {
  private worker: Worker | null = null;
  private lastFrame = performance.now();
  private lastTick = performance.now();
  private readonly onTick: (deltaTime: number) => void;

  constructor(intervalMs: number, onTick: (deltaTime: number) => void) {
    this.onTick = onTick;
    try {
      const url = URL.createObjectURL(new Blob([WORKER_SOURCE], { type: 'text/javascript' }));
      this.worker = new Worker(url);
      URL.revokeObjectURL(url);
    } catch {
      // No workers: the battle pauses while the window is hidden
      return;
    }
    this.worker.onmessage = this.handleTick;
    this.worker.postMessage(intervalMs);
  }

  /** Call from the regular frame loop; worker ticks only fill the gaps. */
  public markFrame(): void {
    this.lastFrame = performance.now();
    this.lastTick = this.lastFrame;
  }

  public destroy(): void {
    if (this.worker !== null) {
      this.worker.terminate();
      this.worker = null;
    }
  }

  private handleTick = (): void => {
    const now = performance.now();
    if (now - this.lastFrame < STALL_MS) {
      return;
    }
    // Same cap as a slow frame, so a stall can't teleport tanks
    const deltaTime = Math.min(0.1, (now - this.lastTick) / 1000);
    this.lastTick = now;
    this.onTick(deltaTime);
  };
}
