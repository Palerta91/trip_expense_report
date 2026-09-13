"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { categories, expenses, receipts, tripBudgets, tripMembers, trips, users } from "@/lib/db/schema";
import { deleteReceiptObjects } from "@/lib/storage";

const tripInput = z.object({
  title: z.string().trim().min(3, "Укажите название").max(180),
  destination: z.string().trim().min(2, "Укажите место командировки").max(180),
  startsOn: z.string().date(),
  endsOn: z.string().date(),
  purpose: z.string().trim().max(2000).optional(),
  budgetEditorId: z.string().uuid().optional()
});

const expenseInput = z.object({
  title: z.string().trim().max(180).optional(),
  categoryId: z.string().uuid().optional(),
  expenseDate: z.string().date(),
  merchant: z.string().trim().min(2, "Укажите продавца или поставщика").max(180),
  merchantOriginal: z.string().trim().max(180).optional(),
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

function readBudgetEntries(formData: FormData) {
  const entries: Array<{ categoryId: string; amountRub: string }> = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("budget_") || typeof value !== "string" || value.trim() === "") continue;
    const categoryId = key.slice("budget_".length);
    const validCategoryId = z.string().uuid().safeParse(categoryId);
    const validAmount = z.coerce.number().positive("Бюджет должен быть больше нуля").max(999999999).safeParse(value);
    if (!validCategoryId.success || !validAmount.success) throw new Error(validAmount.error?.issues[0]?.message ?? "Проверьте бюджет по категориям");
    entries.push({ categoryId, amountRub: validAmount.data.toFixed(2) });
  }
  return entries;
}

async function ensureBudgetCategories(entries: Array<{ categoryId: string }>) {
  if (entries.length === 0) return;
  const valid = await db.select({ id: categories.id }).from(categories).where(inArray(categories.id, entries.map((entry) => entry.categoryId)));
  if (valid.length !== entries.length) throw new Error("Одна из категорий бюджета недоступна");
}

export async function createTrip(formData: FormData) {
  const user = await requireUser();
  if (user.role === "PARTICIPANT") throw new Error("Только менеджер может создавать командировки");

  const parsed = tripInput.safeParse({
    title: formData.get("title"),
    destination: formData.get("destination"),
    startsOn: formData.get("startsOn"),
    endsOn: formData.get("endsOn"),
    purpose: formData.get("purpose") || undefined,
    budgetEditorId: formData.get("budgetEditorId") || undefined
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Проверьте форму");
  if (parsed.data.endsOn < parsed.data.startsOn) throw new Error("Дата окончания не может быть раньше даты начала");

  const budgetEntries = readBudgetEntries(formData);
  await ensureBudgetCategories(budgetEntries);
  const budgetEditorId = parsed.data.budgetEditorId ?? user.id;
  const [budgetEditor] = await db.select({ id: users.id }).from(users).where(eq(users.id, budgetEditorId)).limit(1);
  if (!budgetEditor) throw new Error("Ответственный за бюджет не найден");

  const [trip] = await db.transaction(async (tx) => {
    const [created] = await tx.insert(trips).values({
      title: parsed.data.title,
      destination: parsed.data.destination,
      startsOn: parsed.data.startsOn,
      endsOn: parsed.data.endsOn,
      purpose: parsed.data.purpose,
      managerId: user.id,
      budgetEditorId,
      status: "OPEN"
    }).returning({ id: trips.id });
    await tx.insert(tripMembers).values([{ tripId: created.id, userId: user.id }, { tripId: created.id, userId: budgetEditorId }]).onConflictDoNothing();
    if (budgetEntries.length) await tx.insert(tripBudgets).values(budgetEntries.map((entry) => ({ ...entry, tripId: created.id })));
    return [created];
  });
  redirect(`/trips/${trip.id}`);
}

export async function updateTripBudget(tripId: string, formData: FormData) {
  const user = await requireUser();
  const [trip] = await db.select({ managerId: trips.managerId, budgetEditorId: trips.budgetEditorId }).from(trips).where(eq(trips.id, tripId)).limit(1);
  if (!trip) throw new Error("Командировка не найдена");
  const isManager = trip.managerId === user.id;
  const isAdmin = user.role === "ADMIN";
  const isBudgetEditor = trip.budgetEditorId === user.id;
  if (!isManager && !isAdmin && !isBudgetEditor) throw new Error("Нет прав на изменение бюджета");

  const requestedEditor = z.string().uuid().optional().safeParse(formData.get("budgetEditorId") || undefined);
  if (!requestedEditor.success) throw new Error("Проверьте ответственного за бюджет");
  const budgetEditorId = requestedEditor.data ?? trip.budgetEditorId ?? trip.managerId;
  if (budgetEditorId !== trip.budgetEditorId && !isManager && !isAdmin) throw new Error("Назначать ответственного может руководитель или администратор");
  const budgetEntries = readBudgetEntries(formData);
  await ensureBudgetCategories(budgetEntries);
  const [editor] = await db.select({ id: users.id }).from(users).where(eq(users.id, budgetEditorId)).limit(1);
  if (!editor) throw new Error("Ответственный за бюджет не найден");

  await db.transaction(async (tx) => {
    await tx.update(trips).set({ budgetEditorId }).where(eq(trips.id, tripId));
    await tx.insert(tripMembers).values({ tripId, userId: budgetEditorId }).onConflictDoNothing();
    await tx.delete(tripBudgets).where(eq(tripBudgets.tripId, tripId));
    if (budgetEntries.length) await tx.insert(tripBudgets).values(budgetEntries.map((entry) => ({ ...entry, tripId })));
  });
  revalidatePath(`/trips/${tripId}`);
  revalidatePath(`/trips/${tripId}/budget`);
  revalidatePath("/manager-dashboard");
  redirect(`/trips/${tripId}`);
}

export async function updateExpense(expenseId: string, formData: FormData) {
  const user = await requireUser();
  const [existing] = await db.select().from(expenses).where(eq(expenses.id, expenseId)).limit(1);
  if (!existing || existing.claimantId !== user.id) throw new Error("Можно редактировать только собственные расходы");
  await ensureTripMember(existing.tripId, user.id);
  const parsed = expenseInput.safeParse({
    title: formData.get("title") || undefined,
    categoryId: formData.get("categoryId") || undefined,
    expenseDate: formData.get("expenseDate"),
    merchant: formData.get("merchant"),
    merchantOriginal: formData.get("merchantOriginal") || undefined,
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

export async function deleteTrip(tripId: string) {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Удалять командировки может только администратор");
  const [trip] = await db.select({ id: trips.id }).from(trips).where(eq(trips.id, tripId)).limit(1);
  if (!trip) throw new Error("Командировка не найдена");
  const files = await db.select({ objectKey: receipts.objectKey }).from(receipts).where(eq(receipts.tripId, tripId));
  await deleteReceiptObjects(files.map((file) => file.objectKey));
  await db.delete(trips).where(eq(trips.id, tripId));
  revalidatePath("/");
  redirect("/");
}
