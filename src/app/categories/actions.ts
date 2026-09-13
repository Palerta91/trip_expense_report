"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { categories } from "@/lib/db/schema";

const categoryInput = z.object({ name: z.string().trim().min(2, "Название статьи должно содержать не менее 2 символов").max(100) });

export async function createCategory(formData: FormData) {
  const user = await requireUser();
  if (user.role !== "ADMIN" && user.role !== "MANAGER") throw new Error("Добавлять статьи расходов могут только руководитель или администратор");
  const parsed = categoryInput.safeParse({ name: formData.get("name") });
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Проверьте название статьи");
  try {
    await db.insert(categories).values({ name: parsed.data.name });
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? String(error.code) : "";
    if (code === "23505") throw new Error("Такая статья расходов уже существует");
    throw error;
  }
  revalidatePath("/categories");
  revalidatePath("/trips/new");
  revalidatePath("/manager-dashboard");
  redirect("/categories");
}
