import { createClient } from "redis";

const redisUrl = process.env.REDIS_URL;
const channel = process.env.ALERT_CREATED_CHANNEL || "alert.created";

if (!redisUrl) {
  console.error("[alert-subscriber] REDIS_URL is required. Redis server is owned by the Node.js realtime server.");
  process.exit(1);
}

const subscriber = createClient({ url: redisUrl });

subscriber.on("error", (error) => {
  console.error("[alert-subscriber] redis error:", error);
});

async function main() {
  await subscriber.connect();
  console.log(`[alert-subscriber] connected to ${redisUrl}`);
  console.log(`[alert-subscriber] subscribed channel: ${channel}`);

  await subscriber.subscribe(channel, (message) => {
    try {
      const parsed = JSON.parse(message);
      console.log("[alert-subscriber] received event:");
      console.log(JSON.stringify(parsed, null, 2));
    } catch {
      console.log("[alert-subscriber] received raw message:");
      console.log(message);
    }
  });
}

main().catch((error) => {
  console.error("[alert-subscriber] fatal error:", error);
  process.exit(1);
});
