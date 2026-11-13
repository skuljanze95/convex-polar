// Verifies Polar's webhook signatures (Standard Webhooks) with WebCrypto, so it
// runs in Convex's default runtime. https://polar.sh/docs/integrate/webhooks/delivery

/** How far a delivery's timestamp may be from now, either way. */
const TOLERANCE_SECONDS = 5 * 60;

/** The delivery isn't from Polar, or isn't one this secret signed. */
export class WebhookVerificationError extends Error {
  override name = "WebhookVerificationError";
}

/**
 * Checks that `body` was signed by Polar with `secret` (the endpoint's
 * `whsec_…` secret) and recently. Throws WebhookVerificationError otherwise.
 *
 * Polar signs with one of two keys, depending on when the secret was made:
 * the base64 key after `whsec_` (Standard Webhooks, secrets from 8 September
 * 2026), or the UTF-8 bytes of the whole secret (older ones). Both are tried.
 */
export async function verifyWebhook(
  body: string,
  headers: Headers,
  secret: string,
  now: number = Date.now()
): Promise<void> {
  const id = headers.get("webhook-id");
  const timestamp = headers.get("webhook-timestamp");
  const signatures = headers.get("webhook-signature");
  if (!id || !timestamp || !signatures) throw new WebhookVerificationError("Missing webhook headers");
  const seconds = Number(timestamp);
  if (!Number.isInteger(seconds)) throw new WebhookVerificationError("Invalid webhook-timestamp");
  if (Math.abs(now / 1000 - seconds) > TOLERANCE_SECONDS) {
    throw new WebhookVerificationError("Webhook timestamp is too far from now");
  }

  const signed = new TextEncoder().encode(`${id}.${seconds}.${body}`);
  const keys = await Promise.all(
    signingKeys(secret).map((key) =>
      crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["verify"])
    )
  );
  for (const entry of signatures.split(" ")) {
    const [version, signature] = entry.split(",", 2);
    const bytes = version === "v1" && signature ? decodeBase64(signature) : null;
    if (!bytes) continue;
    for (const key of keys) {
      if (await crypto.subtle.verify("HMAC", key, bytes, signed)) return;
    }
  }
  throw new WebhookVerificationError("No matching webhook signature");
}

function signingKeys(secret: string): Uint8Array<ArrayBuffer>[] {
  const whole = new TextEncoder().encode(secret);
  const decoded = decodeBase64(secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret);
  return decoded && decoded.length > 0 ? [decoded, whole] : [whole];
}

function decodeBase64(value: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length % 4 !== 0) return null;
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Signs `body` the way Polar does, with a Standard Webhooks secret. For tests:
 * returns the three headers a delivery carries.
 */
export async function signWebhook(
  body: string,
  secret: string,
  options: { id?: string; timestamp?: number } = {}
): Promise<Record<"webhook-id" | "webhook-timestamp" | "webhook-signature", string>> {
  const id = options.id ?? `msg_${crypto.randomUUID()}`;
  const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);
  const [key] = signingKeys(secret);
  const hmac = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", hmac, new TextEncoder().encode(`${id}.${timestamp}.${body}`));
  return {
    "webhook-id": id,
    "webhook-timestamp": String(timestamp),
    "webhook-signature": `v1,${btoa(String.fromCharCode(...new Uint8Array(signature)))}`
  };
}
