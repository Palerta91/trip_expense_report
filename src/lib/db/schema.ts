import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar
} from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["ADMIN", "MANAGER", "PARTICIPANT"]);
export const tripStatus = pgEnum("trip_status", ["DRAFT", "OPEN", "SUBMITTED", "APPROVED"]);
export const expenseStatus = pgEnum("expense_status", ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED"]);
export const expenseSource = pgEnum("expense_source", ["MANUAL", "RECEIPT"]);
export const receiptStatus = pgEnum("receipt_status", ["UPLOADED", "PROCESSING", "READY_FOR_REVIEW", "FAILED"]);
export const jobStatus = pgEnum("job_status", ["PENDING", "PROCESSING", "DONE", "FAILED"]);

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: varchar("email", { length: 320 }).notNull().unique(),
  name: varchar("name", { length: 160 }).notNull(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  role: userRole("role").notNull().default("PARTICIPANT"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  tokenHash: varchar("token_hash", { length: 64 }).notNull().unique(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const categories = pgTable("categories", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const trips = pgTable("trips", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: varchar("title", { length: 180 }).notNull(),
  destination: varchar("destination", { length: 180 }).notNull(),
  startsOn: date("starts_on").notNull(),
  endsOn: date("ends_on").notNull(),
  purpose: text("purpose"),
  status: tripStatus("status").notNull().default("DRAFT"),
  managerId: uuid("manager_id").notNull().references(() => users.id),
  budgetEditorId: uuid("budget_editor_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const tripMembers = pgTable(
  "trip_members",
  {
    tripId: uuid("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [primaryKey({ columns: [table.tripId, table.userId] })]
);

export const tripBudgets = pgTable(
  "trip_budgets",
  {
    tripId: uuid("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").notNull().references(() => categories.id),
    amountRub: numeric("amount_rub", { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => [primaryKey({ columns: [table.tripId, table.categoryId] })]
);

export const receipts = pgTable("receipts", {
  id: uuid("id").defaultRandom().primaryKey(),
  tripId: uuid("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  uploadedBy: uuid("uploaded_by").notNull().references(() => users.id),
  objectKey: varchar("object_key", { length: 512 }).notNull().unique(),
  originalName: varchar("original_name", { length: 255 }).notNull(),
  mimeType: varchar("mime_type", { length: 100 }).notNull(),
  byteSize: integer("byte_size").notNull(),
  status: receiptStatus("status").notNull().default("UPLOADED"),
  extracted: jsonb("extracted"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const expenses = pgTable("expenses", {
  id: uuid("id").defaultRandom().primaryKey(),
  tripId: uuid("trip_id").notNull().references(() => trips.id, { onDelete: "cascade" }),
  claimantId: uuid("claimant_id").notNull().references(() => users.id),
  categoryId: uuid("category_id").references(() => categories.id, { onDelete: "set null" }),
  receiptId: uuid("receipt_id").unique().references(() => receipts.id, { onDelete: "set null" }),
  source: expenseSource("source").notNull(),
  status: expenseStatus("status").notNull().default("DRAFT"),
  expenseDate: date("expense_date").notNull(),
  merchant: varchar("merchant", { length: 180 }).notNull(),
  merchantOriginal: varchar("merchant_original", { length: 180 }),
  description: text("description"),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).notNull().default("RUB"),
  exchangeRate: numeric("exchange_rate", { precision: 14, scale: 6 }),
  amountRub: numeric("amount_rub", { precision: 12, scale: 2 }),
  paymentMethod: varchar("payment_method", { length: 80 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const recognitionJobs = pgTable("recognition_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  receiptId: uuid("receipt_id").notNull().unique().references(() => receipts.id, { onDelete: "cascade" }),
  status: jobStatus("status").notNull().default("PENDING"),
  attempts: integer("attempts").notNull().default(0),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  processedAt: timestamp("processed_at", { withTimezone: true })
});
