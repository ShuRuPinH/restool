import { KeyValue } from "./types";

export interface CookiePart {
  name: string;
  value: string;
  raw: string;
}

export interface CookieHeaderGroup {
  key: string;
  value: string;
  parts: CookiePart[];
}

export interface JwtPayload {
  header: unknown;
  payload: unknown;
  signature: string;
  raw: string;
}

export function isCookieHeader(key: string): boolean {
  const lower = key.toLowerCase();
  return lower === "cookie" || lower === "set-cookie";
}

export function joinCookieParts(parts: CookiePart[]): string {
  return parts
    .map((part) => {
      const name = part.name.trim();
      if (!name && !part.value) return "";
      if (part.value === "" && !part.raw.includes("=") && name) {
        return name;
      }
      return `${name}=${part.value}`;
    })
    .filter(Boolean)
    .join("; ");
}

export function splitHeaders(headers: KeyValue[]): {
  cookies: CookieHeaderGroup[];
  rest: KeyValue[];
} {
  const cookies: CookieHeaderGroup[] = [];
  const rest: KeyValue[] = [];

  for (const header of headers) {
    if (isCookieHeader(header.key)) {
      cookies.push({
        key: header.key,
        value: header.value,
        parts: parseCookieParts(header.key, header.value),
      });
    } else {
      rest.push(header);
    }
  }

  return { cookies, rest };
}

export function parseCookieParts(headerKey: string, value: string): CookiePart[] {
  const segments = value
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);

  const lower = headerKey.toLowerCase();

  // Set-Cookie: first pair is the cookie, the rest are attributes.
  // Cookie: every pair is a cookie.
  return segments.map((segment) => {
    const eq = segment.indexOf("=");
    if (eq === -1) {
      return { name: segment, value: "", raw: segment };
    }
    return {
      name: segment.slice(0, eq).trim(),
      value: segment.slice(eq + 1).trim(),
      raw: segment,
    };
  }).filter((part, index) => {
    if (lower !== "set-cookie") return true;
    // Keep cookie + attributes for set-cookie
    return index === 0 || part.name.length > 0;
  });
}

function base64UrlDecode(input: string): string {
  let base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = base64.length % 4;
  if (pad) base64 += "=".repeat(4 - pad);
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function looksLikeJwt(value: string): boolean {
  if (!value || value.length < 20) return false;
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  if (!parts.every((p) => /^[A-Za-z0-9_-]+$/.test(p) && p.length > 0)) {
    return false;
  }
  try {
    const header = JSON.parse(base64UrlDecode(parts[0]));
    return typeof header === "object" && header !== null && "alg" in header;
  } catch {
    return false;
  }
}

export function decodeJwt(value: string): JwtPayload | null {
  if (!looksLikeJwt(value)) return null;
  const [headerB64, payloadB64, signature] = value.split(".");
  try {
    return {
      header: JSON.parse(base64UrlDecode(headerB64)),
      payload: JSON.parse(base64UrlDecode(payloadB64)),
      signature,
      raw: value,
    };
  } catch {
    return null;
  }
}

export function formatJwtJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
