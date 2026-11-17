import { mergedVariants } from "../../database/schema.js"
import type { InferInsertModel, InferSelectModel } from "drizzle-orm"

export type variant = InferSelectModel<typeof mergedVariants>

export interface commerceVairantInput {
    commerceVariantId: string;
    productId: string;
    sku: string | null | undefined;
    title: string | null | undefined;
    options: unknown;
    price: unknown;
    inventoryQuantity: number | null | undefined;
}

export interface updateVariantInput {
    sku?: string | null;
    title?: string | null;
    options?: unknown;
    price?: unknown;
    inventoryQuantity?: number | null;
}