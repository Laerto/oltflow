// BullMQ vendors its own nested `ioredis` copy, which is type-incompatible with a
// top-level ioredis instance constructed here. Passing plain connection options
// instead lets BullMQ construct (and own) its connection with its own ioredis copy.
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
const url = new URL(REDIS_URL);

export const connection = {
  host: url.hostname,
  port: Number(url.port || 6379),
  password: url.password || undefined,
  maxRetriesPerRequest: null as null,
};
