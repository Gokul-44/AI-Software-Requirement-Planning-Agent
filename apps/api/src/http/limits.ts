/** In-memory sliding-window limiter, per key (the client IP). Enough for one API process. */
export class HourlyLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs = 3_600_000,
    private readonly now: () => number = Date.now,
  ) {}

  /** Records a hit and returns true when it is allowed. A limit of 0 disables the limiter. */
  take(key: string): boolean {
    if (this.limit <= 0) return true;
    const t = this.now();
    const recent = (this.hits.get(key) ?? []).filter((x) => t - x < this.windowMs);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(t);
    this.hits.set(key, recent);
    if (this.hits.size > 10_000) this.prune(t);
    return true;
  }

  private prune(t: number): void {
    for (const [key, list] of this.hits) {
      if (list.every((x) => t - x >= this.windowMs)) this.hits.delete(key);
    }
  }
}
