const MAX_PAYLOAD_BYTES = 12_000;
const LOCAL_ORIGINS = [
  "http://127.0.0.1:8000",
  "http://localhost:8000",
  "http://127.0.0.1:5173",
  "http://localhost:5173",
];
const PRODUCTION_ORIGINS = [
  "https://eventomrc.com.br",
  "https://www.eventomrc.com.br",
  "https://evellyn-litke.vercel.app",
];

function configuredOrigins(): Set<string> {
  const configured = [
    Deno.env.get("SITE_URL"),
    ...(Deno.env.get("ALLOWED_ORIGINS") ?? "").split(","),
    ...PRODUCTION_ORIGINS,
    ...LOCAL_ORIGINS,
  ]
    .map((value) => value?.trim().replace(/\/$/, ""))
    .filter((value): value is string => Boolean(value));

  return new Set(configured);
}

export function preflightResponse(request: Request): Response {
  return new Response(null, {
    status: isAllowedOrigin(request) ? 204 : 403,
    headers: corsHeaders(request),
  });
}

export function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin")?.replace(/\/$/, "");
  return Boolean(origin && configuredOrigins().has(origin));
}

export function corsHeaders(request: Request): HeadersInit {
  const origin = request.headers.get("origin")?.replace(/\/$/, "");
  const allowedOrigin = origin && configuredOrigins().has(origin) ? origin : "";

  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, content-type, x-client-info, x-idempotency-key, x-turnstile-token",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Vary": "Origin",
    "X-Content-Type-Options": "nosniff",
  };
}

export function jsonResponse(
  request: Request,
  status: number,
  body: Record<string, unknown>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders(request),
  });
}

export async function readJsonBody(
  request: Request,
  maxPayloadBytes = MAX_PAYLOAD_BYTES,
): Promise<unknown> {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > maxPayloadBytes) {
    throw new HttpError(413, "payload_too_large");
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new HttpError(415, "unsupported_media_type");
  }

  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > maxPayloadBytes) {
    throw new HttpError(413, "payload_too_large");
  }

  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, "invalid_json");
  }
}

export function readBearerToken(request: Request): string | null {
  const value = request.headers.get("authorization") ?? "";
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function timingSafeEqual(left: string | null, right: string): boolean {
  if (!left || left.length !== right.length) return false;
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  let mismatch = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    mismatch |= leftBytes[index] ^ rightBytes[index];
  }
  return mismatch === 0;
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (
    request.headers.get("cf-connecting-ip") ??
    forwarded ??
    request.headers.get("x-real-ip") ??
    "unknown"
  ).slice(0, 80);
}

export async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly field?: string,
  ) {
    super(code);
  }
}
