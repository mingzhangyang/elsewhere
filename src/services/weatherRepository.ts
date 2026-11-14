import { fetchWeatherForDate, weatherKey } from '../lib/weather';
import type { LocationInfo, WeatherResult } from '../types';
import { describeNetworkFailure } from '../lib/networkErrors';

/** In-memory only: choosing device coordinates never persists them implicitly. */
export class WeatherRepository {
  private cache = new Map<string, WeatherResult>();
  private pending = new Map<
    string,
    { controller: AbortController; users: number; promise: Promise<WeatherResult> }
  >();
  constructor(
    private loader = fetchWeatherForDate,
    private now = Date.now,
  ) {}
  peek(key: string) {
    const value = this.cache.get(key);
    return value
      ? { ...value, cacheState: this.fresh(value) ? ('cached' as const) : ('stale' as const) }
      : null;
  }
  private fresh(value: WeatherResult) {
    return (
      this.now() - value.fetchedAt <
      (value.status === 'ready' && value.source === 'historical' ? 86400000 : 900000)
    );
  }
  acquire(location: LocationInfo, date: Date, force = false) {
    const key = weatherKey(location, date),
      cached = this.cache.get(key);
    if (!force && cached && this.fresh(cached))
      return { promise: Promise.resolve({ ...cached, cacheState: 'cached' as const }), release() {} };
    let job = this.pending.get(key);
    if (!job || job.controller.signal.aborted) {
      const controller = new AbortController();
      const promise = this.loader(location, date, { signal: controller.signal })
        .catch(
          (error: unknown): WeatherResult => ({
            key,
            fetchedAt: this.now(),
            status: 'error',
            message: describeNetworkFailure(error, 'weather'),
          }),
        )
        .then((data): WeatherResult => {
          if (controller.signal.aborted) return data;
          if (data.status === 'ready') {
            this.cache.delete(key);
            this.cache.set(key, data);
            if (this.cache.size > 32) this.cache.delete(this.cache.keys().next().value!);
          }
          if (data.status === 'error' && cached?.status === 'ready')
            return {
              ...cached,
              cacheState: 'stale',
              notice: 'Refresh failed. Showing cached weather; its fetch time is shown below.',
            };
          return data;
        })
        .finally(() => {
          if (this.pending.get(key)?.controller === controller) this.pending.delete(key);
        });
      job = { controller, promise, users: 0 };
      this.pending.set(key, job);
    }
    job.users++;
    const acquired = job;
    let released = false;
    return {
      promise: acquired.promise,
      release() {
        if (released) return;
        released = true;
        acquired.users--;
        // StrictMode setup/cleanup/setup can reacquire before this microtask.
        queueMicrotask(() => {
          if (acquired.users === 0) acquired.controller.abort();
        });
      },
    };
  }
}
