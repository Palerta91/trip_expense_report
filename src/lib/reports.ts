import ExcelJS from "exceljs";
import { AlignmentType, Document, PageOrientation, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { categories, expenses, trips, users } from "@/lib/db/schema";

export async function getTripReportData(tripId: string) {
  const [trip] = await db.select().from(trips).where(eq(trips.id, tripId)).limit(1);
  if (!trip) throw new Error("Командировка не найдена");
  const rows = await db
    .select({ expense: expenses, categoryName: categories.name, claimantName: users.name })
    .from(expenses)
    .leftJoin(categories, eq(expenses.categoryId, categories.id))
    .innerJoin(users, eq(expenses.claimantId, users.id))
    .where(eq(expenses.tripId, tripId))
    .orderBy(asc(expenses.expenseDate), asc(expenses.createdAt));
  return { trip, rows };
}

const money = (amount: string | null, currency = "RUB") => amount ? new Intl.NumberFormat("ru-RU", { style: "currency", currency }).format(Number(amount)) : "—";

export async function createXlsxReport(tripId: string) {
  const { trip, rows } = await getTripReportData(tripId);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Командировки";
  const sheet = workbook.addWorksheet("Расходы", { views: [{ state: "frozen", ySplit: 5 }] });
  sheet.mergeCells("A1:I1");
  sheet.getCell("A1").value = `Отчёт по командировке: ${trip.title}`;
  sheet.getCell("A1").font = { bold: true, size: 16, color: { argb: "FF12213B" } };
  sheet.getCell("A2").value = `Маршрут: ${trip.destination}`;
  sheet.getCell("A3").value = `Период: ${trip.startsOn} — ${trip.endsOn}`;
  const headerRow = sheet.getRow(5);
  headerRow.values = ["Дата", "Участник", "Категория", "Поставщик", "Описание", "Сумма", "Валюта", "В рублях", "Источник"];
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
  headerRow.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  for (const { expense, categoryName, claimantName } of rows) {
    sheet.addRow([expense.expenseDate, claimantName, categoryName ?? "Не выбрана", expense.merchant, expense.description ?? "", Number(expense.amount), expense.currency, expense.amountRub ? Number(expense.amountRub) : "", expense.source === "MANUAL" ? "Вручную" : "Из чека"]);
  }
  const firstDataRow = 6;
  const lastDataRow = Math.max(firstDataRow, sheet.rowCount);
  sheet.getColumn(1).width = 13; sheet.getColumn(2).width = 22; sheet.getColumn(3).width = 18; sheet.getColumn(4).width = 26; sheet.getColumn(5).width = 36; sheet.getColumn(6).width = 14; sheet.getColumn(7).width = 10; sheet.getColumn(8).width = 16; sheet.getColumn(9).width = 14;
  sheet.getColumn(6).numFmt = "#,##0.00"; sheet.getColumn(8).numFmt = "#,##0.00";
  sheet.autoFilter = { from: "A5", to: `I${lastDataRow}` };
  const total = rows.reduce((sum, row) => sum + Number(row.expense.amountRub ?? 0), 0);
  const totalRow = sheet.addRow(["", "", "", "", "Итого в рублях", "", "", total, ""]);
  totalRow.font = { bold: true }; totalRow.getCell(8).numFmt = "#,##0.00";
  sheet.pageSetup.orientation = "landscape";
  sheet.pageSetup.fitToPage = true;
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function cell(text: string, bold = false) {
  return new TableCell({ width: { size: 1100, type: WidthType.DXA }, children: [new Paragraph({ children: [new TextRun({ text, bold, size: 18 })] })] });
}

export async function createDocxReport(tripId: string) {
  const { trip, rows } = await getTripReportData(tripId);
  const total = rows.reduce((sum, row) => sum + Number(row.expense.amountRub ?? 0), 0);
  const tableRows = [
    new TableRow({ tableHeader: true, children: ["Дата", "Участник", "Категория", "Поставщик", "Сумма", "В рублях", "Источник"].map((title) => cell(title, true)) }),
    ...rows.map(({ expense, categoryName, claimantName }) => new TableRow({ children: [expense.expenseDate, claimantName, categoryName ?? "Не выбрана", expense.merchant, money(expense.amount, expense.currency), money(expense.amountRub), expense.source === "MANUAL" ? "Вручную" : "Из чека"].map((value) => cell(value)) })),
    new TableRow({ children: ["", "", "", "Итого", "", money(total.toFixed(2)), ""].map((value) => cell(value, value === "Итого" || value === money(total.toFixed(2)))) })
  ];
  const document = new Document({
    sections: [{
      properties: { page: { size: { orientation: PageOrientation.LANDSCAPE } } },
      children: [
        new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Отчёт по командировке", bold: true, size: 32 })] }),
        new Paragraph({ children: [new TextRun({ text: trip.title, bold: true, size: 26 })] }),
        new Paragraph(`Маршрут: ${trip.destination}`),
        new Paragraph(`Период: ${trip.startsOn} — ${trip.endsOn}`),
        new Paragraph({ text: "" }),
        new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: tableRows })
      ]
    }]
  });
  return Packer.toBuffer(document);
}
