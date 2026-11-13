import os from "node:os";

try {
  if (process.argv[2] === "worker") {
    const { default: Redis } = await import("ioredis");
    const redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 1,
      connectTimeout: 5000,
      retryStrategy: () => null,
    });
    redis.on("error", () => {});
    try {
      const value = await redis.get("health:worker:dm");
      const heartbeat = value ? JSON.parse(value) : null;
      if (!heartbeat || heartbeat.hostname !== os.hostname() ||
          !(Date.now() - Date.parse(heartbeat.checkedAt) < 120_000)) {
        throw new Error("Worker heartbeat is missing or stale");
      }
    } finally {
      redis.disconnect();
    }
  } else {
    const response = await fetch("http://127.0.0.1:3000/api/auth/providers", {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error("Web app is not ready");
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
