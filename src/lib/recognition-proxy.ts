import { createHmac, timingSafeEqual } from "node:crypto";

const lifetimeMs = 5 * 60_000;

function secret() {
  const value = process.env.MINIMAX_API_KEY;
  if (!value) throw new Error("MINIMAX_API_KEY не задан");
  return value;
}

function signature(receiptId: string, attempt: number, expiresAt: number) {
  return createHmac("sha256", secret()).update(`${receiptId}.${attempt}.${expiresAt}`).digest("base64url");
}

export function createRecognitionProxyUrl(receiptId: string, attempt: number) {
  const appUrl = process.env.APP_URL?.replace(/\/$/, "");
  if (!appUrl) throw new Error("APP_URL не задан для передачи чека в MiniMax");
  const expiresAt = Date.now() + lifetimeMs;
  const url = new URL(`/api/recognition-files/${receiptId}`, appUrl);
  url.searchParams.set("attempt", String(attempt));
  url.searchParams.set("expiresAt", String(expiresAt));
  url.searchParams.set("signature", signature(receiptId, attempt, expiresAt));
  return url.toString();
}

export function isRecognitionProxySignatureValid(receiptId: string, attempt: number, expiresAt: number, received: string) {
  if (!Number.isSafeInteger(attempt) || attempt < 1 || !Number.isSafeInteger(expiresAt) || expiresAt < Date.now() || expiresAt - Date.now() > lifetimeMs + 5_000) return false;
  const expected = Buffer.from(signature(receiptId, attempt, expiresAt));
  const actual = Buffer.from(received);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
