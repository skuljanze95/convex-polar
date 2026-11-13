/**
 * The Polar API version every request and webhook is read with. Polar keeps
 * three versions at a time and removes the oldest each quarter, so moving to
 * the next one is a release of this package: bump this, update the shapes in
 * src/component/validators.ts and src/client/parse.ts, run the tests.
 * See https://polar.sh/docs/api-reference/versioning.
 */
export const POLAR_API_VERSION = "2026-10";

export type PolarServer = "sandbox" | "production";

const BASE_URLS: Record<PolarServer, string> = {
  production: "https://api.polar.sh",
  sandbox: "https://sandbox-api.polar.sh"
};

export type PolarRequestConfig = { accessToken: string; server: PolarServer };

export type PolarRequestInit = {
  /** Query parameters; undefined ones are left out, arrays are repeated. */
  query?: Record<string, string | number | boolean | readonly (string | number)[] | undefined>;
  /** A JSON body. */
  body?: unknown;
};

/** A request Polar answered with an error status. `body` is its JSON answer. */
export class PolarError extends Error {
  override name = "PolarError";
  constructor(
    readonly status: number,
    readonly body: unknown,
    readonly method: string,
    readonly path: string
  ) {
    super(`Polar ${method} ${path} failed with ${status}${describe(body)}`);
  }
}

/**
 * Calls Polar's REST API with the organization access token, pinned to
 * POLAR_API_VERSION. Returns the parsed JSON, or undefined for an empty body
 * (a 202 or 204). Throws PolarError for an error status.
 */
export async function polarRequest<T = unknown>(
  config: PolarRequestConfig,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  init: PolarRequestInit = {}
): Promise<T> {
  const url = new URL(path, BASE_URLS[config.server]);
  for (const [key, value] of Object.entries(init.query ?? {})) {
    if (value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) url.searchParams.append(key, String(item));
  }
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${config.accessToken}`,
      "Polar-Version": POLAR_API_VERSION,
      Accept: "application/json",
      ...(init.body === undefined ? {} : { "Content-Type": "application/json" })
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body)
  });
  const text = await response.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = text;
  }
  if (!response.ok) throw new PolarError(response.status, json, method, path);
  return json as T;
}

/** Polar's error detail: a message, or FastAPI's list of field errors. */
function describe(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const detail = (body as { detail?: unknown }).detail;
  if (typeof detail === "string") return `: ${detail}`;
  if (Array.isArray(detail)) {
    const messages = detail.map((item: { loc?: unknown[]; msg?: string }) =>
      [item.loc?.slice(1).join("."), item.msg].filter(Boolean).join(": ")
    );
    return `: ${messages.join("; ")}`;
  }
  return "";
}
