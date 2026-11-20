import type { Tracking } from './exercises';
export interface Rep { min: number; max: number; rom: number; durationMs: number; quality: 'good' | 'partial'; feedback: string }
export class RepCounter {
  reps = 0;
  phase: 'ready' | 'moving' | 'returning' = 'ready';
  lastRep: Rep | null = null;
  feedback = 'Get into position';
  private start?: number;
  private min = Infinity;
  private max = -Infinity;
  private reached = false;
  private form = '';
  private time = -Infinity;
  private validTime = -Infinity;
  private swingSide = 0;
  private swingDeparted = false;
  private previous: {metric: number; time: number} | null = null;
  constructor(readonly config: Tracking) {}
  interrupt() { this.start = undefined; this.phase = 'ready'; this.swingSide = 0; this.reached = false; this.form = ''; this.previous = null; }
  update(metric: number | null, timestampMs: number, formFeedback = '') {
    if (!Number.isFinite(timestampMs) || timestampMs <= this.time) return this;
    this.time = timestampMs;
    if (metric === null || !Number.isFinite(metric)) { this.feedback = 'Step into view so your joints are visible'; return this; }
    if (timestampMs - this.validTime > 500) this.interrupt();
    this.validTime = timestampMs;
    const c = this.config;
    if (c.mode === 'swing') {
      const side = metric > c.enterAbove! ? 1 : metric < c.exitBelow! ? -1 : 0;
      if (!this.swingSide && side) { this.swingSide = side; this.begin(metric, timestampMs); }
      if (this.start !== undefined) {
        this.sample(metric, formFeedback);
        if (metric * this.swingSide < 0) this.swingDeparted = true;
        if (side && side !== this.swingSide) {
          this.reached = true; this.finish(timestampMs); this.swingSide = side; this.begin(metric, timestampMs);
        } else if (side && this.swingDeparted) {
          this.finish(timestampMs); this.begin(metric, timestampMs);
        }
      }
    } else {
      const low = c.enterBelow !== undefined;
      const home = low ? c.exitAbove! : c.exitBelow!;
      const target = low ? c.enterBelow! : c.enterAbove!;
      const progress = (metric - home) / (target - home);
      if (this.start === undefined && progress > 0.25) {
        this.begin(this.previous?.metric ?? metric, this.previous?.time ?? timestampMs);
      }
      if (this.start !== undefined) {
        this.sample(metric, formFeedback);
        if (progress > 1) { this.reached = true; this.phase = 'returning'; }
        if (progress < 0) this.finish(timestampMs);
      }
    }
    this.previous = {metric, time: timestampMs};
    this.feedback = formFeedback || (this.phase === 'returning' ? 'Return slowly with control' : this.phase === 'moving' ? c.targetRangeLabel : this.lastRep?.feedback ?? c.targetRangeLabel);
    return this;
  }
  private begin(metric: number, time: number) { this.start = time; this.min = this.max = metric; this.reached = false; this.swingDeparted = false; this.form = ''; this.phase = 'moving'; }
  private sample(metric: number, form: string) { this.min = Math.min(this.min, metric); this.max = Math.max(this.max, metric); if (form) this.form = form; }
  private finish(time: number) {
    const durationMs = time - this.start!;
    const good = this.reached && durationMs >= this.config.minRepMs && !this.form;
    const feedback = this.form || (!this.reached ? 'Partial rep: use your comfortable full range' : durationMs < this.config.minRepMs ? 'Slow down for a controlled repetition' : 'Good repetition');
    this.lastRep = {min: this.min, max: this.max, rom: this.max - this.min, durationMs, quality: good ? 'good' : 'partial', feedback};
    if (good) this.reps++;
    this.start = undefined; this.phase = 'ready';
  }
}
