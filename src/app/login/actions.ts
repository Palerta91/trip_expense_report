"use server";

import { count, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSession, destroySession, hashPassword, passwordMatches } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureDefaultCategories } from "@/lib/db/seed";
import { users } from "@/lib/db/schema";

const credentials = z.object({
  email: z.string().email("Укажите корректный email").max(320),
  password: z.string().min(10, "Пароль должен содержать не менее 10 символов").max(200)
});

export async function setupAdmin(formData: FormData) {
  const parsed = credentials.extend({ name: z.string().min(2).max(160) }).safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password")
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Проверьте поля формы");

  const [{ total }] = await db.select({ total: count() }).from(users);
  if (Number(total) > 0) redirect("/login");

  const [admin] = await db
    .insert(users)
    .values({ ...parsed.data, passwordHash: hashPassword(parsed.data.password), role: "ADMIN" })
    .returning({ id: users.id });

  await ensureDefaultCategories();
  await createSession(admin.id);
  redirect("/");
}

export async function login(formData: FormData) {
  const parsed = credentials.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) throw new Error("Проверьте email и пароль");

  const [user] = await db.select().from(users).where(eq(users.email, parsed.data.email.toLowerCase())).limit(1);
  if (!user || !passwordMatches(parsed.data.password, user.passwordHash)) {
    throw new Error("Неверный email или пароль");
  }

  await createSession(user.id);
  redirect("/");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}
