export interface Scheduler {
  setInterval(cb: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

const defaultScheduler: Scheduler = {
  setInterval: (cb, ms) => setInterval(cb, ms),
  clearInterval: (h) => clearInterval(h as ReturnType<typeof setInterval>),
};

export class BlinkController {
  private timer: unknown;
  private active = true;
  visible = true;

  constructor(private scheduler: Scheduler = defaultScheduler) {}

  start(rate: number, onToggle: () => void): void {
    this.stop();
    this.visible = true;
    this.active = true;
    this.timer = this.scheduler.setInterval(() => {
      if (!this.active) return;
      this.visible = !this.visible;
      onToggle();
    }, rate);
  }

  setActive(active: boolean): void {
    this.active = active;
    if (!active) this.visible = true;
  }

  stop(): void {
    if (this.timer !== undefined) this.scheduler.clearInterval(this.timer);
    this.timer = undefined;
  }
}