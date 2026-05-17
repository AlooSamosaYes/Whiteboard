/**
 * 1€ (One Euro) Filter Implementation
 * An adaptive low-pass filter for smoothing noisy sensor data (e.g., smart board jitter)
 * while minimizing lag during quick movements.
 */

class LowPassFilter {
  private y: number | null = null;
  private s: number | null = null;

  public filter(value: number, alpha: number): number {
    if (this.y === null || this.s === null) {
      this.y = value;
      this.s = value;
      return value;
    }
    this.s = alpha * value + (1 - alpha) * this.s;
    this.y = value;
    return this.s;
  }

  public lastValue(): number {
    return this.y ?? 0;
  }
}

export class OneEuroFilter {
  private minCutoff: number;
  private beta: number;
  private dCutoff: number;

  private xFilter: LowPassFilter;
  private yFilter: LowPassFilter;
  private dxFilter: LowPassFilter;
  private dyFilter: LowPassFilter;

  private lastTime: number | null = null;

  /**
   * @param minCutoff Minimum cutoff frequency (Hz) - decrease to reduce jitter at low speeds.
   * @param beta Velocity coefficient - increase to reduce lag at high speeds.
   * @param dCutoff Cutoff frequency for the derivative (Hz) - typically left at 1.0.
   */
  constructor(minCutoff: number = 1.0, beta: number = 0.05, dCutoff: number = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;

    this.xFilter = new LowPassFilter();
    this.yFilter = new LowPassFilter();
    this.dxFilter = new LowPassFilter();
    this.dyFilter = new LowPassFilter();
  }

  private calculateAlpha(cutoff: number, dt: number): number {
    const tau = 1.0 / (2.0 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / dt);
  }

  /**
   * Filters a new incoming coordinate.
   * @param x Raw X coordinate
   * @param y Raw Y coordinate
   * @param timestamp Current timestamp in milliseconds
   * @returns Smoothed X and Y coordinates
   */
  public filter(x: number, y: number, timestamp: number): { x: number; y: number } {
    if (this.lastTime === null) {
      this.lastTime = timestamp;
      this.xFilter.filter(x, 1.0);
      this.yFilter.filter(y, 1.0);
      return { x, y };
    }

    const dt = (timestamp - this.lastTime) / 1000.0; // Convert dt to seconds
    if (dt <= 0) {
      return { x: this.xFilter.lastValue(), y: this.yFilter.lastValue() };
    }

    this.lastTime = timestamp;

    // Calculate velocities
    const dx = (x - this.xFilter.lastValue()) / dt;
    const dy = (y - this.yFilter.lastValue()) / dt;

    // Filter velocities
    const edx = this.dxFilter.filter(dx, this.calculateAlpha(this.dCutoff, dt));
    const edy = this.dyFilter.filter(dy, this.calculateAlpha(this.dCutoff, dt));

    // Calculate dynamic cutoffs based on velocity (speed)
    const cutoffX = this.minCutoff + this.beta * Math.abs(edx);
    const cutoffY = this.minCutoff + this.beta * Math.abs(edy);

    // Filter positions using dynamic alphas
    const filteredX = this.xFilter.filter(x, this.calculateAlpha(cutoffX, dt));
    const filteredY = this.yFilter.filter(y, this.calculateAlpha(cutoffY, dt));

    return { x: filteredX, y: filteredY };
  }

  /**
   * Resets the filter state. Call this when starting a new stroke.
   */
  public reset(): void {
    this.lastTime = null;
    this.xFilter = new LowPassFilter();
    this.yFilter = new LowPassFilter();
    this.dxFilter = new LowPassFilter();
    this.dyFilter = new LowPassFilter();
  }
}