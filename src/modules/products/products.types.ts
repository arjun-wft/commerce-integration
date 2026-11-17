import { mergedProducts } from "../../database/schema.js"
import type { InferInsertModel, InferSelectModel } from "drizzle-orm"

// Pick means is mergedProducts me se ye props lene h

export type Product = InferSelectModel<typeof mergedProducts>
export type createProductInput = Pick<typeof mergedProducts.$inferInsert, "commerceProductId" | "title" | "handle" | "description">
export type updateProductInput = Partial<Pick<typeof mergedProducts.$inferInsert, "title" | "handle" | "description">>
export interface commerceProductInput {
    id: string;
    title: string;
    handle: string | null;
    description: string | null;
}

export interface cmsContentInput {
    cmsContentId: string;
    seoTitle: string | null;
    seoDescription: string | null;
    richContent: unknown;
    contentStatus: string;
}