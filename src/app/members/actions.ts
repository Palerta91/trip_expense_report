"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { hashPassword, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { tripMembers, trips, users } from "@/lib/db/schema";

const newMemberSchema = z.object({
  name: z.string().trim().min(2).max(160),
  email: z.string().trim().email().max(320),
  password: z.string().min(10).max(200),
  role: z.enum(["ADMIN", "MANAGER", "PARTICIPANT"])
});

export async function createMember(formData: FormData) {
  const current = await requireUser();
  if (current.role !== "ADMIN") throw new Error("Только администратор может добавлять участников");
  const parsed = newMemberSchema.safeParse({ name: formData.get("name"), email: formData.get("email"), password: formData.get("password"), role: formData.get("role") });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Проверьте данные участника");
  const adminManagerEmail = process.env.ADMIN_MANAGER_EMAIL?.toLowerCase();
  if (parsed.data.role === "ADMIN" && current.email.toLowerCase() !== adminManagerEmail) {
    throw new Error("Создавать других администраторов может только назначенная учётная запись");
  }
  await db.insert(users).values({ ...parsed.data, email: parsed.data.email.toLowerCase(), passwordHash: hashPassword(parsed.data.password) });
  revalidatePath("/members");
  redirect("/members");
}

export async function addTripMember(tripId: string, formData: FormData) {
  const current = await requireUser();
  const [trip] = await db.select({ managerId: trips.managerId }).from(trips).where(eq(trips.id, tripId)).limit(1);
  if (!trip || (trip.managerId !== current.id && current.role !== "ADMIN")) throw new Error("Только руководитель командировки может добавлять участников");
  const userId = z.string().uuid().parse(formData.get("userId"));
  await db.insert(tripMembers).values({ tripId, userId }).onConflictDoNothing();
  revalidatePath(`/trips/${tripId}/members`);
  revalidatePath(`/trips/${tripId}`);
  redirect(`/trips/${tripId}/members`);
}
