CREATE TABLE "trip_budgets" (
	"trip_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"amount_rub" numeric(12, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_budgets_trip_id_category_id_pk" PRIMARY KEY("trip_id","category_id")
);
--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "budget_editor_id" uuid;--> statement-breakpoint
ALTER TABLE "trip_budgets" ADD CONSTRAINT "trip_budgets_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_budgets" ADD CONSTRAINT "trip_budgets_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_budget_editor_id_users_id_fk" FOREIGN KEY ("budget_editor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;