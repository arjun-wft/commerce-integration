ALTER TABLE "merged_product" RENAME TO "merged_products";--> statement-breakpoint
ALTER TABLE "merged-variants" RENAME TO "merged_variants";--> statement-breakpoint
ALTER TABLE "merged_variants" DROP CONSTRAINT "merged-variants_product_id_merged_product_id_fk";
--> statement-breakpoint
ALTER TABLE "merged_variants" ADD COLUMN "updated-at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "merged_variants" ADD CONSTRAINT "merged_variants_product_id_merged_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."merged_products"("id") ON DELETE cascade ON UPDATE no action;