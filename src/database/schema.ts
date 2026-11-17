 import {
    pgTable,
    uuid,
    varchar, text,
    timestamp,
    uniqueIndex, jsonb,
    integer,
    index
} from 'drizzle-orm/pg-core'

// 1. Merged prodcuts
export const mergedProducts = pgTable('merged_products', {
    id: uuid('id').defaultRandom().primaryKey(),

    commerceProductId: varchar('commerce_product_id', {
        length: 255
    }).notNull(),

    cmsContentId: varchar('cms_content_id', { length: 255 }),
    title: varchar('title', { length: 500 }).notNull(),

    handle: varchar('handle', { length: 255 }),
    description: text("description"),

    seoTitle: varchar("seo_title", { length: 500 }),

    seoDescription: text("seo_description"),

    richContent: jsonb("rich_content"),

    contentStatus: varchar("content_status", {
        length: 50,
    }).notNull().default("missing"),

    lastSyncedAt: timestamp("last_synced_at", {
        withTimezone: true,
    }),

    createdAt: timestamp("created_at", {
        withTimezone: true,
    }).defaultNow().notNull(),

    updatedAt: timestamp("updated_at", {
        withTimezone: true,
    }).defaultNow().notNull(),
}, (table) => [
    uniqueIndex('merged_products_commerce_id_idx').on(table.commerceProductId)
])

export const mergedVariants = pgTable('merged_variants', {
    id: uuid('id').defaultRandom().primaryKey(),

    commerceVariantId: varchar('commerce_variant_id', {
        length: 255
    }).notNull(),

    productId: uuid('product_id').notNull().references(() => mergedProducts.id, {
        onDelete: 'cascade'
    }),

    sku: varchar('sku', { length: 255 }),
    title: varchar('title', { length: 255 }),

    options: jsonb("options"),

    price: jsonb("price"),

    inventoryQuantity: integer("inventory_quantity"),

    lastSyncedAt: timestamp("last_synced_at", {
        withTimezone: true,
    }),

    createdAt: timestamp("created_at", {
        withTimezone: true,
    }).defaultNow().notNull(),

    updatedAt:timestamp('updated-at' , {
        withTimezone:true,
    }).defaultNow().notNull()

}, (table) => [
    uniqueIndex('merged_variants_commerce_id_idx').on(table.commerceVariantId),
    index('merged_variants_product_id_idx').on(table.productId)
])

// 3. Webhook Events
export const webhookEvents = pgTable(
    "webhook_events",
    {
        id: uuid("id").defaultRandom().primaryKey(),

        source: varchar("source", { length: 50 }).notNull(),

        externalEventId: varchar("external_event_id", {
            length: 255,
        }).notNull(),

        eventType: varchar("event_type", { length: 255 }).notNull(),

        payload: jsonb("payload").notNull(),

        status: varchar("status", { length: 50 })
            .notNull().default("received"),

        receivedAt: timestamp("received_at", {
            withTimezone: true,
        }).defaultNow().notNull(),

        processedAt: timestamp("processed_at", {
            withTimezone: true,
        }),

        errorMessage: text("error_message"),
    },
    (table) => [
        uniqueIndex("webhook_source_event_idx")
            .on(table.source, table.externalEventId),
    ]
);

// 4. Sync Jobs
export const syncJobs = pgTable(
    "sync_jobs",
    {
        id: uuid("id").defaultRandom().primaryKey(),

        commerceProductId: varchar("commerce_product_id", {
            length: 255,
        }).notNull(),

        status: varchar("status", { length: 50 })
            .notNull().default("pending"),

        attempts: integer("attempts").notNull().default(0),

        errorMessage: text("error_message"),

        createdAt: timestamp("created_at", {
            withTimezone: true,
        }).defaultNow().notNull(),

        updatedAt: timestamp("updated_at", {
            withTimezone: true,
        }).defaultNow().notNull(),
    },
    (table) => [
        index("sync_jobs_product_id_idx")
            .on(table.commerceProductId),
    ]
);