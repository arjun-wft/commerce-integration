CREATE TABLE "merged_product" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"commerce_product_id" varchar(255) NOT NULL,
	"cmd_content_id" varchar(255),
	"title" varchar(500) NOT NULL,
	"handle" varchar(255),
	"description" text,
	"seo_title" varchar(500),
	"seo_description" text,
	"rich_content" jsonb,
	"content_status" varchar(50) DEFAULT 'missing' NOT NULL,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merged-variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"commerce_variant_id" varchar(255) NOT NULL,
	"product_id" uuid NOT NULL,
	"sku" varchar(255),
	"title" varchar(255),
	"options" jsonb,
	"price" jsonb,
	"inventory_quantity" integer,
	"last_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"commerce_product_id" varchar(255) NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" varchar(50) NOT NULL,
	"external_event_id" varchar(255),
	"event_type" varchar(255) NOT NULL,
	"payload" jsonb NOT NULL,
	"status" varchar(50) DEFAULT 'received' NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"error_message" text
);
--> statement-breakpoint
ALTER TABLE "merged-variants" ADD CONSTRAINT "merged-variants_product_id_merged_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."merged_product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "merged_products_commerce_id_idx" ON "merged_product" USING btree ("commerce_product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "merged_variants_commerce_id_idx" ON "merged-variants" USING btree ("commerce_variant_id");--> statement-breakpoint
CREATE INDEX "merged_variants_product_id_idx" ON "merged-variants" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "sync_jobs_product_id_idx" ON "sync_jobs" USING btree ("commerce_product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_source_event_idx" ON "webhook_events" USING btree ("source","external_event_id");