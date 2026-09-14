import { createHmac, timingSafeEqual } from "node:crypto";

const lifetimeMs = 5 * 60_000;

function secret() {
  const value = process.env.MINIMAX_API_KEY;
  if (!value) throw new Error("MINIMAX_API_KEY не задан");
  return value;
}

function signature(receiptId: string, startedAt: number, expiresAt: number) {
  return createHmac("sha256", secret()).update(`${receiptId}.${startedAt}.${expiresAt}`).digest("base64url");
}

export function createRecognitionProxyUrl(receiptId: string, started: Date) {
  const appUrl = process.env.APP_URL?.replace(/\/$/, "");
  if (!appUrl) throw new Error("APP_URL не задан для передачи чека в MiniMax");
  const startedAt = started.getTime();
  const expiresAt = Date.now() + lifetimeMs;
  const url = new URL(`/api/recognition-files/${receiptId}`, appUrl);
  url.searchParams.set("startedAt", String(startedAt));
  url.searchParams.set("expiresAt", String(expiresAt));
  url.searchParams.set("signature", signature(receiptId, startedAt, expiresAt));
  return url.toString();
}

export function isRecognitionProxySignatureValid(receiptId: string, startedAt: number, expiresAt: number, received: string) {
  if (!Number.isSafeInteger(startedAt) || !Number.isSafeInteger(expiresAt) || expiresAt < Date.now() || expiresAt - Date.now() > lifetimeMs + 5_000) return false;
  const expected = Buffer.from(signature(receiptId, startedAt, expiresAt));
  const actual = Buffer.from(received);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
