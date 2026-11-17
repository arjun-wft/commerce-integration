import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { pool } from "../../config/database.js"
import {
    createProduct,
    deleteProduct,
    findAllProducts,
    findByHandle,
    findProductByCommerceId,
    findProductById,
    updateFromDirectus,
    updateProduct,
    upsertProduct
} from "./products.repository.js"

const createdProductIds: string[] = []

async function createTestProduct() {
    const suffix = randomUUID()
    const product = await createProduct({
        commerceProductId: `integration-product-${suffix}`,
        title: `Integration Product ${suffix}`,
        handle: `integration-product-${suffix}`
    })
    if (product?.id) createdProductIds.push(product.id)
    return product
}

describe("products repository integration", () => {
    beforeAll(async () => {
        await pool.query("SELECT 1")
    })

    afterAll(async () => {
        await pool.end()
    })

    afterEach(async () => {
        for (const id of createdProductIds.splice(0)) {
            await deleteProduct(id)
        }
    })

    it("creates a product in PostgreSQL", async () => {
        const product = await createTestProduct()
        expect(product).toMatchObject({
            commerceProductId: expect.stringMatching(/^integration-product-/),
            title: expect.stringMatching(/^Integration Product /)
        })
    })

    it("finds a product by internal, commerce and handle identifiers", async () => {
        const created = await createTestProduct()
        await expect(findProductById(created.id)).resolves.toEqual(created)
        await expect(findProductByCommerceId(created.commerceProductId)).resolves.toEqual(created)
        await expect(findByHandle(created.handle!)).resolves.toEqual(created)
    })

    it("returns null for a missing product", async () => {
        await expect(findProductByCommerceId(`missing-${randomUUID()}`)).resolves.toBeNull()
    })

    it("lists the product from PostgreSQL", async () => {
        const created = await createTestProduct()
        const products = await findAllProducts()
        expect(products.some((product) => product.id === created.id)).toBe(true)
    })

    it("updates a product", async () => {
        const created = await createTestProduct()
        const updated = await updateProduct(created.id, { title: "Updated Integration Product" })
        expect(updated?.title).toBe("Updated Integration Product")
        expect(updated?.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime())
    })

    it("updates CMS data from Directus", async () => {
        const created = await createTestProduct()
        const updated = await updateFromDirectus(created.commerceProductId, {
            cmsContentId: randomUUID(),
            seoTitle: "Integration SEO title",
            seoDescription: "Integration SEO description",
            richContent: { body: "Integration content" },
            contentStatus: "published"
        })
        expect(updated).toMatchObject({
            cmsContentId: expect.any(String),
            seoTitle: "Integration SEO title",
            contentStatus: "published"
        })
    })

    it("upserts a product without creating duplicate commerce product rows", async () => {
        const created = await createTestProduct()
        const result = await upsertProduct({
            commerceProductId: created.commerceProductId,
            title: "Upserted Integration Product",
            handle: created.handle
        })
        await upsertProduct({
            commerceProductId: created.commerceProductId,
            title: "Upserted Integration Product Again",
            handle: created.handle
        })

        const countResult = await pool.query(
            "SELECT COUNT(*)::int AS count FROM merged_products WHERE commerce_product_id = $1",
            [created.commerceProductId]
        )
        expect(result?.title).toBe("Upserted Integration Product")
        expect(countResult.rows[0].count).toBe(1)
    })

    it("deletes a product", async () => {
        const created = await createTestProduct()
        const deleted = await deleteProduct(created.id)
        expect(deleted?.id).toBe(created.id)
        await expect(findProductById(created.id)).resolves.toBeNull()
        createdProductIds.splice(createdProductIds.indexOf(created.id), 1)
    })
})
