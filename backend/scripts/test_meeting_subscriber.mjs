import { createClient } from "redis";

const redisUrl = process.env.REDIS_URL;
const channel = process.env.MEETING_UPDATED_CHANNEL || "meeting.updated";

if (!redisUrl) {
  console.error("[meeting-subscriber] REDIS_URL is required. Redis server is owned by the Node.js realtime server.");
  process.exit(1);
}

const subscriber = createClient({ url: redisUrl });

subscriber.on("error", (error) => {
  console.error("[meeting-subscriber] redis error:", error);
});

async function main() {
  await subscriber.connect();
  console.log(`[meeting-subscriber] connected to ${redisUrl}`);
  console.log(`[meeting-subscriber] subscribed channel: ${channel}`);

  await subscriber.subscribe(channel, (message) => {
    try {
      const parsed = JSON.parse(message);
      console.log("[meeting-subscriber] received event:");
      console.log(JSON.stringify(parsed, null, 2));
    } catch {
      console.log("[meeting-subscriber] received raw message:");
      console.log(message);
    }
  });
}

main().catch((error) => {
  console.error("[meeting-subscriber] fatal error:", error);
  process.exit(1);
});
