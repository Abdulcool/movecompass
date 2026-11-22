export class OneEuroFilter {
  private value?: number;
  private raw?: number;
  private derivative = 0;
  private time?: number;
  constructor(readonly minCutoff = 1, readonly beta = 0.02, readonly derivativeCutoff = 1) {
    if (!(minCutoff > 0 && beta >= 0 && derivativeCutoff > 0)) throw new Error('Invalid filter settings');
  }
  reset() { this.value = this.raw = this.time = undefined; this.derivative = 0; }
  filter(value: number, timestampMs: number): number {
    if (!Number.isFinite(value) || !Number.isFinite(timestampMs)) throw new Error('Invalid filter sample');
    if (this.time !== undefined && timestampMs <= this.time) return this.value!;
    if (this.time === undefined) { this.time = timestampMs; this.raw = this.value = value; return value; }
    const dt = (timestampMs - this.time) / 1000;
    const alpha = (cutoff: number) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));
    this.derivative += alpha(this.derivativeCutoff) * ((value - this.raw!) / dt - this.derivative);
    this.value! += alpha(this.minCutoff + this.beta * Math.abs(this.derivative)) * (value - this.value!);
    this.raw = value; this.time = timestampMs;
    return this.value!;
  }
}
