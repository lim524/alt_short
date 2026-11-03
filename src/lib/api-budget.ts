const buckets = new Map<
  string,
  { start: number; calls: number; active: number }
>();
export function enterBudget(
  name: string,
  limit = 30,
  concurrency = 2,
): (() => void) | null {
  const now = Date.now();
  let b = buckets.get(name);
  if (!b) {
    b = { start: now, calls: 0, active: 0 };
    buckets.set(name, b);
  }
  if (now - b.start > 60000) {
    b.start = now;
    b.calls = 0;
  }
  if (b.calls >= limit || b.active >= concurrency) return null;
  b.calls++;
  b.active++;
  let done = false;
  return () => {
    if (!done) {
      b!.active--;
      done = true;
    }
  };
}
