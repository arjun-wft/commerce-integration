import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { pool } from "../../config/database.js"
import { createProduct, deleteProduct } from "../products/products.repository.js"
import {
    createVariant,
    deleteVariantById,
    findVariantByCommerceId,
    findVariantById,
    findVariantByProductId,
    updateVariantByCommerceId,
    upsertVariant
} from "./variants.repository.js"

const createdProductIds: string[] = []
const createdVariantIds: string[] = []

async function createTestProduct() {
    const suffix = randomUUID()
    const product = await createProduct({
        commerceProductId: `variant-integration-product-${suffix}`,
        title: `Variant Integration Product ${suffix}`,
        handle: `variant-integration-product-${suffix}`
    })
    if (product?.id) createdProductIds.push(product.id)
    return product
}

async function createTestVariant(productId: string) {
    const suffix = randomUUID()
    const variant = await createVariant({
        commerceVariantId: `integration-variant-${suffix}`,
        productId,
        sku: `INT-${suffix.slice(0, 8)}`,
        title: `Integration Variant ${suffix.slice(0, 8)}`,
        options: { size: "M" },
        price: { amount: "1000", currency: "USD" },
        inventoryQuantity: 5
    })
    if (variant?.id) createdVariantIds.push(variant.id)
    return variant
}

describe("variants repository integration", () => {
    beforeAll(async () => {
        await pool.query("SELECT 1")
    })

    afterAll(async () => {
        await pool.end()
    })

    afterEach(async () => {
        for (const id of createdVariantIds.splice(0)) {
            await deleteVariantById(id)
        }
        for (const id of createdProductIds.splice(0)) {
            await deleteProduct(id)
        }
    })

    it("creates a variant in PostgreSQL", async () => {
        const product = await createTestProduct()
        const variant = await createTestVariant(product.id)
        expect(variant).toMatchObject({
            commerceVariantId: expect.stringMatching(/^integration-variant-/),
            productId: product.id,
            inventoryQuantity: 5
        })
    })

    it("finds a variant by internal and commerce identifiers", async () => {
        const product = await createTestProduct()
        const created = await createTestVariant(product.id)
        await expect(findVariantById(created.id)).resolves.toEqual(created)
        await expect(findVariantByCommerceId(created.commerceVariantId)).resolves.toEqual(created)
    })

    it("finds variants by product id", async () => {
        const product = await createTestProduct()
        const created = await createTestVariant(product.id)
        const variants = await findVariantByProductId(product.id)
        expect(variants.some((variant) => variant.id === created.id)).toBe(true)
    })

    it("returns null for a missing variant", async () => {
        await expect(findVariantByCommerceId(`missing-${randomUUID()}`)).resolves.toBeNull()
    })

    it("rejects a variant with an invalid product id", async () => {
        try {
            await createVariant({
                commerceVariantId: `integration-invalid-variant-${randomUUID()}`,
                productId: randomUUID(),
                sku: `INVALID-${randomUUID().slice(0, 8)}`,
                title: "Invalid Product Variant"
            })
            expect.unreachable("Expected invalid product foreign key to fail")
        } catch (error) {
            expect(error).toBeInstanceOf(Error)
            expect(error).toMatchObject({
                cause: { code: "23503" }
            })
        }
    })

    it("updates a variant", async () => {
        const product = await createTestProduct()
        const created = await createTestVariant(product.id)
        const updated = await updateVariantByCommerceId(created.commerceVariantId, {
            title: "Updated Integration Variant",
            inventoryQuantity: 12
        })
        expect(updated).toMatchObject({
            title: "Updated Integration Variant",
            inventoryQuantity: 12
        })
    })

    it("upserts a variant", async () => {
        const product = await createTestProduct()
        const created = await createTestVariant(product.id)
        const upserted = await upsertVariant({
            commerceVariantId: created.commerceVariantId,
            productId: product.id,
            sku: "UPSERT-INTEGRATION-SKU",
            title: "Upserted Integration Variant",
            options: { size: "L" },
            price: { amount: "1500", currency: "USD" },
            inventoryQuantity: 20
        })
        expect(upserted).toMatchObject({
            commerceVariantId: created.commerceVariantId,
            sku: "UPSERT-INTEGRATION-SKU",
            title: "Upserted Integration Variant",
            inventoryQuantity: 20
        })
    })

    it("deletes a variant", async () => {
        const product = await createTestProduct()
        const created = await createTestVariant(product.id)
        const deleted = await deleteVariantById(created.id)
        expect(deleted?.id).toBe(created.id)
        await expect(findVariantByCommerceId(created.commerceVariantId)).resolves.toBeNull()
        createdVariantIds.splice(createdVariantIds.indexOf(created.id), 1)
    })

    it("deletes associated variants when the product is deleted", async () => {
        const product = await createTestProduct()
        const variant = await createTestVariant(product.id)
        const deletedProduct = await deleteProduct(product.id)

        expect(deletedProduct?.id).toBe(product.id)
        await expect(findVariantByCommerceId(variant.commerceVariantId)).resolves.toBeNull()
        createdVariantIds.splice(createdVariantIds.indexOf(variant.id), 1)
        createdProductIds.splice(createdProductIds.indexOf(product.id), 1)
    })
})
