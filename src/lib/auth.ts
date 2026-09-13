import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { sessions, users } from "@/lib/db/schema";

const cookieName = "trip_expense_session";
const sessionLifetimeMs = 1000 * 60 * 60 * 24 * 14;

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const key = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${key}`;
}

export function passwordMatches(password: string, stored: string) {
  const [salt, key] = stored.split(":");
  if (!salt || !key) return false;
  const calculated = scryptSync(password, salt, 64);
  const expected = Buffer.from(key, "hex");
  return expected.length === calculated.length && timingSafeEqual(expected, calculated);
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + sessionLifetimeMs);
  await db.insert(sessions).values({ tokenHash: hash(token), userId, expiresAt });

  const store = await cookies();
  store.set(cookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.SESSION_COOKIE_SECURE !== "false",
    expires: expiresAt,
    path: "/"
  });
}

export async function getSessionUser() {
  const store = await cookies();
  const token = store.get(cookieName)?.value;
  if (!token) return null;

  const result = await db
    .select({ id: users.id, name: users.name, email: users.email, role: users.role })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, hash(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);

  return result[0] ?? null;
}

export async function requireUser() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(cookieName)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, hash(token)));
  store.delete(cookieName);
}
