import { db } from "./index";
import { categories } from "./schema";

const defaults = ["Проживание", "Проезд", "Питание", "Такси", "Связь", "Прочее"];

export async function ensureDefaultCategories() {
  await db.insert(categories).values(defaults.map((name) => ({ name }))).onConflictDoNothing();
}
