import { describe, expect, test } from "vitest";
import { WEBHOOK_SECRET } from "./fixtures.test.helpers.js";
import { signWebhook, verifyWebhook, WebhookVerificationError } from "./webhook.js";

const body = JSON.stringify({ type: "subscription.updated", data: {} });

async function legacySignature(secret: string, id: string, timestamp: number, payload: string) {
  // Polar HMAC (secrets made before 8 September 2026): the key is the whole secret's UTF-8 bytes.
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${timestamp}.${payload}`));
  return `v1,${btoa(String.fromCharCode(...new Uint8Array(signature)))}`;
}

describe("verifyWebhook", () => {
  test("accepts a Standard Webhooks signature", async () => {
    const headers = new Headers(await signWebhook(body, WEBHOOK_SECRET));
    await expect(verifyWebhook(body, headers, WEBHOOK_SECRET)).resolves.toBeUndefined();
  });

  test("accepts Polar's older HMAC signature over the whole secret", async () => {
    const timestamp = Math.floor(Date.now() / 1000);
    const headers = new Headers({
      "webhook-id": "msg_1",
      "webhook-timestamp": String(timestamp),
      "webhook-signature": await legacySignature(WEBHOOK_SECRET, "msg_1", timestamp, body)
    });
    await expect(verifyWebhook(body, headers, WEBHOOK_SECRET)).resolves.toBeUndefined();
  });

  test("accepts any one matching signature of several", async () => {
    const signed = await signWebhook(body, WEBHOOK_SECRET);
    const headers = new Headers({ ...signed, "webhook-signature": `v1,AAAA ${signed["webhook-signature"]}` });
    await expect(verifyWebhook(body, headers, WEBHOOK_SECRET)).resolves.toBeUndefined();
  });

  test("rejects a changed body, another secret, and missing headers", async () => {
    const headers = new Headers(await signWebhook(body, WEBHOOK_SECRET));
    await expect(verifyWebhook(`${body} `, headers, WEBHOOK_SECRET)).rejects.toThrow(WebhookVerificationError);
    await expect(verifyWebhook(body, headers, `whsec_${btoa("another key")}`)).rejects.toThrow(
      WebhookVerificationError
    );
    await expect(verifyWebhook(body, new Headers(), WEBHOOK_SECRET)).rejects.toThrow(/Missing webhook headers/);
  });

  test("rejects a delivery signed more than five minutes away from now", async () => {
    const timestamp = Math.floor(Date.now() / 1000) - 6 * 60;
    const headers = new Headers(await signWebhook(body, WEBHOOK_SECRET, { timestamp }));
    await expect(verifyWebhook(body, headers, WEBHOOK_SECRET)).rejects.toThrow(/too far from now/);
  });
});
