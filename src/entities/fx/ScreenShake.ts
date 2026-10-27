/**
 * Camera shake applied as a CSS transform on the canvas element, so the
 * dirty-rect renderer never has to repaint the whole scene. Strongest active
 * shake wins; amplitude decays linearly. Disabled for reduced-motion users.
 */
export class ScreenShake {
  private intensity = 0;
  private duration = 0;
  private remaining = 0;
  private readonly enabled: boolean;

  constructor() {
    this.enabled = !(
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    );
  }

  public shake(intensity: number, duration: number): void {
    if (!this.enabled) {
      return;
    }
    const current = this.getAmplitude();
    if (intensity >= current) {
      this.intensity = intensity;
      this.duration = duration;
      this.remaining = duration;
    }
  }

  public update(deltaTime: number): void {
    this.remaining = Math.max(0, this.remaining - deltaTime);
  }

  public getAmplitude(): number {
    if (this.remaining <= 0 || this.duration <= 0) {
      return 0;
    }
    return this.intensity * (this.remaining / this.duration);
  }

  /** CSS transform for this frame ('' when still). */
  public getTransform(): string {
    const amplitude = this.getAmplitude();
    if (amplitude === 0) {
      return '';
    }
    const x = (Math.random() * 2 - 1) * amplitude;
    const y = (Math.random() * 2 - 1) * amplitude;
    return `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
  }
}
