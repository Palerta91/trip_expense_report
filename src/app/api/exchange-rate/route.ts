import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";

export const runtime = "nodejs";

const requestSchema = z.object({ currency: z.string().trim().length(3).transform((value) => value.toUpperCase()), date: z.string().date() });

function xmlValue(block: string, tag: string) {
  return block.match(new RegExp(`<${tag}>([^<]+)</${tag}>`))?.[1]?.trim();
}

export async function GET(request: Request) {
  if (!await getSessionUser()) return NextResponse.json({ message: "Требуется вход" }, { status: 401 });
  const parsed = requestSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ message: "Передайте валюту и дату оплаты" }, { status: 400 });
  if (parsed.data.currency === "RUB") return NextResponse.json({ currency: "RUB", rate: 1, rateDate: parsed.data.date, source: "manual" });

  const [year, month, day] = parsed.data.date.split("-");
  const response = await fetch(`https://www.cbr.ru/scripts/XML_daily.asp?date_req=${day}/${month}/${year}`, { cache: "no-store", headers: { Accept: "application/xml" } });
  if (!response.ok) return NextResponse.json({ message: "Банк России временно не ответил. Введите курс вручную." }, { status: 502 });
  const xml = await response.text();
  const blocks = xml.match(/<Valute[^>]*>[\s\S]*?<\/Valute>/g) ?? [];
  const block = blocks.find((item) => xmlValue(item, "CharCode") === parsed.data.currency);
  if (!block) return NextResponse.json({ message: `Банк России не публикует курс ${parsed.data.currency} на эту дату. Введите курс вручную.` }, { status: 404 });
  const nominal = Number((xmlValue(block, "Nominal") ?? "1").replace(",", "."));
  const value = Number((xmlValue(block, "Value") ?? "").replace(",", "."));
  if (!Number.isFinite(nominal) || !Number.isFinite(value) || nominal <= 0) return NextResponse.json({ message: "Не удалось прочитать ответ Банка России. Введите курс вручную." }, { status: 502 });
  const rateDate = xml.match(/Date="(\d{2}\.\d{2}\.\d{4})"/)?.[1] ?? parsed.data.date;
  return NextResponse.json({ currency: parsed.data.currency, rate: value / nominal, rateDate, source: "cbr" });
}
