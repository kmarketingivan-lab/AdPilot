import type IORedis from "ioredis";

let _redis: IORedis | null = null;

export function getRedisConnection(): IORedis {
  if (!_redis) {
    // Dynamic require to avoid importing ioredis at build time
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Redis = require("ioredis") as { default: new (...args: unknown[]) => IORedis; new (...args: unknown[]): IORedis };
    const Ctor = Redis.default ?? Redis;
    const url = process.env.REDIS_URL || "redis://localhost:6379";
    _redis = new (Ctor as new (url: string, opts: Record<string, unknown>) => IORedis)(url, {
      maxRetriesPerRequest: null,
    });
  }
  return _redis;
}

/**
 * Backward-compatible lazy proxy — does NOT create a Redis connection
 * until a property/method is actually accessed at runtime.
 */
export const redisConnection: IORedis = new Proxy({} as IORedis, {
  get(_, prop, receiver) {
    const real = getRedisConnection();
    const val = Reflect.get(real, prop, receiver);
    return typeof val === "function" ? val.bind(real) : val;
  },
});
