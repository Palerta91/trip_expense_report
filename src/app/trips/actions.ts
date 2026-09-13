"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { expenses, tripMembers, trips } from "@/lib/db/schema";

const tripInput = z.object({
  title: z.string().trim().min(3, "Укажите название").max(180),
  destination: z.string().trim().min(2, "Укажите место командировки").max(180),
  startsOn: z.string().date(),
  endsOn: z.string().date(),
  purpose: z.string().trim().max(2000).optional()
});

const expenseInput = z.object({
  categoryId: z.string().uuid().optional(),
  expenseDate: z.string().date(),
  merchant: z.string().trim().min(2, "Укажите продавца или поставщика").max(180),
  description: z.string().trim().max(2000).optional(),
  amount: z.coerce.number().positive("Сумма должна быть больше нуля").max(999999999),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()),
  exchangeRate: z.union([z.literal(""), z.coerce.number().positive()]).optional(),
  paymentMethod: z.string().trim().max(80).optional()
});

async function ensureTripMember(tripId: string, userId: string) {
  const [membership] = await db
    .select({ tripId: tripMembers.tripId })
    .from(tripMembers)
    .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, userId)))
    .limit(1);
  if (!membership) throw new Error("У вас нет доступа к этой командировке");
}

export async function createTrip(formData: FormData) {
  const user = await requireUser();
  if (user.role === "PARTICIPANT") throw new Error("Только менеджер может создавать командировки");

  const parsed = tripInput.safeParse({
    title: formData.get("title"),
    destination: formData.get("destination"),
    startsOn: formData.get("startsOn"),
    endsOn: formData.get("endsOn"),
    purpose: formData.get("purpose") || undefined
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Проверьте форму");
  if (parsed.data.endsOn < parsed.data.startsOn) throw new Error("Дата окончания не может быть раньше даты начала");

  const [trip] = await db.insert(trips).values({ ...parsed.data, managerId: user.id, status: "OPEN" }).returning({ id: trips.id });
  await db.insert(tripMembers).values({ tripId: trip.id, userId: user.id });
  redirect(`/trips/${trip.id}`);
}

export async function createManualExpense(tripId: string, formData: FormData) {
  const user = await requireUser();
  await ensureTripMember(tripId, user.id);
  const parsed = expenseInput.safeParse({
    categoryId: formData.get("categoryId") || undefined,
    expenseDate: formData.get("expenseDate"),
    merchant: formData.get("merchant"),
    description: formData.get("description") || undefined,
    amount: formData.get("amount"),
    currency: formData.get("currency"),
    exchangeRate: formData.get("exchangeRate"),
    paymentMethod: formData.get("paymentMethod") || undefined
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Проверьте форму");

  const { exchangeRate, amount, currency, ...rest } = parsed.data;
  const rate = exchangeRate === "" || exchangeRate === undefined ? (currency === "RUB" ? 1 : undefined) : exchangeRate;
  await db.insert(expenses).values({
    ...rest,
    tripId,
    claimantId: user.id,
    amount: amount.toFixed(2),
    currency,
    exchangeRate: rate?.toFixed(6),
    amountRub: rate ? (amount * rate).toFixed(2) : null,
    source: "MANUAL"
  });
  revalidatePath(`/trips/${tripId}`);
  redirect(`/trips/${tripId}`);
}

export async function updateExpense(expenseId: string, formData: FormData) {
  const user = await requireUser();
  const [existing] = await db.select().from(expenses).where(eq(expenses.id, expenseId)).limit(1);
  if (!existing || existing.claimantId !== user.id) throw new Error("Можно редактировать только собственные расходы");
  await ensureTripMember(existing.tripId, user.id);
  const parsed = expenseInput.safeParse({
    categoryId: formData.get("categoryId") || undefined,
    expenseDate: formData.get("expenseDate"),
    merchant: formData.get("merchant"),
    description: formData.get("description") || undefined,
    amount: formData.get("amount"),
    currency: formData.get("currency"),
    exchangeRate: formData.get("exchangeRate"),
    paymentMethod: formData.get("paymentMethod") || undefined
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Проверьте форму");
  const { exchangeRate, amount, currency, ...rest } = parsed.data;
  const rate = exchangeRate === "" || exchangeRate === undefined ? (currency === "RUB" ? 1 : undefined) : exchangeRate;
  await db.update(expenses).set({
    ...rest,
    amount: amount.toFixed(2),
    currency,
    exchangeRate: rate?.toFixed(6),
    amountRub: rate ? (amount * rate).toFixed(2) : null,
    updatedAt: new Date()
  }).where(eq(expenses.id, expenseId));
  revalidatePath(`/trips/${existing.tripId}`);
  redirect(`/trips/${existing.tripId}`);
}
