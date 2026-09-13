import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, expenses, tripBudgets } from "@/lib/db/schema";

export type BudgetLine = {
  categoryId: string;
  categoryName: string;
  planRub: number;
  factRub: number;
};

export type BudgetOverview = {
  lines: BudgetLine[];
  totalPlanRub: number;
  totalFactRub: number;
};

export async function getTripBudgetOverview(tripId: string): Promise<BudgetOverview> {
  const [budgetRows, expenseRows] = await Promise.all([
    db
      .select({ categoryId: tripBudgets.categoryId, categoryName: categories.name, amountRub: tripBudgets.amountRub })
      .from(tripBudgets)
      .innerJoin(categories, eq(tripBudgets.categoryId, categories.id))
      .where(eq(tripBudgets.tripId, tripId))
      .orderBy(asc(categories.name)),
    db
      .select({ categoryId: expenses.categoryId, categoryName: categories.name, amountRub: expenses.amountRub })
      .from(expenses)
      .leftJoin(categories, eq(expenses.categoryId, categories.id))
      .where(eq(expenses.tripId, tripId))
  ]);

  const facts = new Map<string, { name: string; amountRub: number }>();
  for (const expense of expenseRows) {
    const categoryId = expense.categoryId ?? "__uncategorized";
    const existing = facts.get(categoryId) ?? { name: expense.categoryName ?? "Без категории", amountRub: 0 };
    existing.amountRub += Number(expense.amountRub ?? 0);
    facts.set(categoryId, existing);
  }

  const lines = budgetRows.map((row) => ({
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    planRub: Number(row.amountRub),
    factRub: facts.get(row.categoryId)?.amountRub ?? 0
  }));
  for (const [categoryId, fact] of facts) {
    if (!budgetRows.some((row) => row.categoryId === categoryId)) lines.push({ categoryId, categoryName: fact.name, planRub: 0, factRub: fact.amountRub });
  }

  return {
    lines,
    totalPlanRub: lines.reduce((sum, line) => sum + line.planRub, 0),
    totalFactRub: lines.reduce((sum, line) => sum + line.factRub, 0)
  };
}
