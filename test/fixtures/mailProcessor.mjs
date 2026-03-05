import { setTimeout as delay } from "node:timers/promises";
import { createHash } from "node:crypto";

export async function sendMailProcessor(job) {
  const recipient = String(job?.payload?.to ?? "unknown@example.com");

  await delay(5);

  const requestId = createHash("sha1")
    .update(`${recipient}:${Date.now()}`)
    .digest("hex")
    .slice(0, 12);

  return {
    delivered: true,
    provider: "mock-mail-provider",
    recipient,
    requestId,
  };
}
