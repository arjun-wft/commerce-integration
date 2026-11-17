import { db } from "../../config/drizzle.js"
import { mergedVariants } from "../../database/schema.js"
import { eq } from "drizzle-orm"

export async function createVariant(data: typeof mergedVariants.$inferInsert) {
    const [variant] = await db.insert(mergedVariants).values(data).returning()
    console.info("Variant Inserted")
    return variant
}

export async function findVariantById(id: string) {
    const [variant] = await db.select().from(mergedVariants).where(eq(mergedVariants.id, id))
    return variant ?? null
}

export async function findVariantByCommerceId(id: string) {
    const [variant] = await db.select().from(mergedVariants).where(eq(mergedVariants.commerceVariantId, id))
    return variant ?? null
}

export async function findVariantByProductId(id: string) {
    return await db.select().from(mergedVariants).where(eq(mergedVariants.productId, id))
}

export async function updateVariantByCommerceId(id: string, data: Partial<typeof mergedVariants.$inferInsert>) {
    const [variant] = await db.update(mergedVariants).set({
        ...data,
        updatedAt: new Date()
    }).where(eq(mergedVariants.commerceVariantId, id)).returning()
    return variant ?? null
}

export async function upsertVariant(data: typeof mergedVariants.$inferInsert){
    const [variant] = await db
        .insert(mergedVariants)
        .values(data)
        .onConflictDoUpdate({
            target: mergedVariants.commerceVariantId,
            set: {
                sku: data.sku,
                title: data.title,
                options: data.options,
                price: data.price,
                inventoryQuantity: data.inventoryQuantity,
                updatedAt: new Date(),
                lastSyncedAt: new Date(),
                productId:data.productId
            }
        })
        .returning();

    return variant;
}

export async function deleteVariantById(id: string){
    const [variant] = await db
        .delete(mergedVariants)
        .where(eq(mergedVariants.id, id))
        .returning();

    return variant ?? null;
}

export async function deleteVairantByCommerceId(commerceVariantId:string){
    const [vairant] = await db.delete(mergedVariants).where(eq(mergedVariants.commerceVariantId , commerceVariantId)).returning()
    return vairant ?? null
}