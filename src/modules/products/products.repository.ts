import { db } from "../../config/drizzle.js"
import { mergedProducts } from "../../database/schema.js"
import { eq } from "drizzle-orm"
import type { updateProductInput } from "./products.types.js"

export async function createProduct(data: typeof mergedProducts.$inferInsert) {
    const [product] = await db.insert(mergedProducts).values(data).returning()
    console.info("Product Added Successfuly")
    return product
}

export async function findProductById(id: string) {
    const [product] = await db.select().from(mergedProducts).where(eq(mergedProducts.id, id))
    return product ?? null
}

export async function findProductByCommerceId(id: string) {
    const [product] = await db.select().from(mergedProducts).where(eq(mergedProducts.commerceProductId, id))
    return product ?? null
}

export async function findByHandle(handle: string) {
    const [product] = await db.select().from(mergedProducts).where(eq(mergedProducts.handle, handle))
    return product ?? null
}

export async function updateProduct(id: string, data: Partial<typeof mergedProducts.$inferInsert>) {
    const [product] = await db.update(mergedProducts).set({ ...data, updatedAt: new Date() }).where(eq(mergedProducts.id, id)).returning()
    return product ?? null
}

export async function updateProductByCommerceId(
    commerceProductId: string,
    data: updateProductInput
) {
    const [product] = await db
        .update(mergedProducts)
        .set({
            ...data,
            updatedAt: new Date(),
            lastSyncedAt: new Date()
        })
        .where(eq(mergedProducts.commerceProductId, commerceProductId))
        .returning()

    return product ?? null
}

export async function upsertProduct(data: typeof mergedProducts.$inferInsert) {
    const [product] = await db.insert(mergedProducts).values({ ...data, lastSyncedAt: new Date() }).onConflictDoUpdate({
        target: mergedProducts.commerceProductId,
        set: {
            title: data.title,
            handle: data.handle,
            description: data.description,
            updatedAt: new Date(),
            lastSyncedAt: new Date()
        }
    }).returning()

    return product ?? null
}

export async function updateFromDirectus(commerceProductId: string, cmsData: {
    cmsContentId: string;
    seoTitle: string | null;
    seoDescription: string | null;
    richContent: unknown;
    contentStatus: string;
}) {

    // check product is presnet or not in same query

    const [product] = await db.update(mergedProducts).set({
        cmsContentId: cmsData.cmsContentId,
        seoTitle: cmsData.seoTitle,
        seoDescription: cmsData.seoDescription,
        richContent: cmsData.richContent,
        contentStatus: cmsData.contentStatus,
        updatedAt: new Date()
    }).where(eq(mergedProducts.commerceProductId, commerceProductId)).returning()

    return product ?? null
}

export async function findAllProducts() {
    const products = await db.select().from(mergedProducts)
    return products
}

export async function deleteProduct(id: string) {
    const [product] = await db.delete(mergedProducts).where(eq(mergedProducts.id, id)).returning()
    return product ?? null
}

export async function deleteByCommerceId(commerceProductId: string) {
    const [product] = await db.delete(mergedProducts).where(eq(mergedProducts.commerceProductId, commerceProductId)).returning()
    return product ?? null
}

export async function unlinkFromDirectus(cmsContentId: string) {
    const products = await db.update(mergedProducts)
        .set({
            cmsContentId: null,
            seoTitle: null,
            seoDescription: null,
            richContent: null,
            contentStatus: "missing",
            updatedAt: new Date()
        })
        .where(eq(mergedProducts.cmsContentId, cmsContentId))
        .returning()

    return products
}