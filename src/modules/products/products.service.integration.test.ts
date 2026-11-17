import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { pool } from "../../config/database.js"
import {
    createProduct,
    deleteProduct,
    syncCmsContent,
    syncCommerceProduct,
    updateProduct
} from "./products.service.js"
import { deleteVariantById, findVariantByCommerceId } from "../variants/variants.repository.js"
import { createVariant, syncVariantProduct, updateVariant } from "../variants/variants.service.js"

const productIds: string[] = []
const variantIds: string[] = []

async function makeProduct() {
    const suffix = randomUUID()
    const product = await createProduct({
        commerceProductId: `service-product-${suffix}`,
        title: `Service Product ${suffix}`,
        handle: `service-product-${suffix}`,
        description: "Original commerce description"
    })
    productIds.push(product.id)
    return product
}

async function cleanup() {
    for (const id of variantIds.splice(0)) await deleteVariantById(id)
    for (const id of productIds.splice(0)) await deleteProduct(id)
}

describe("product and variant service integration flow", () => {
    beforeAll(async () => {
        await pool.query("SELECT 1")
    })

    afterEach(cleanup)
    afterAll(async () => {
        await pool.end()
    })

    it("1. createProduct creates the product", async () => {
        const product = await makeProduct()
        expect(product.title).toMatch(/^Service Product /)
    })

    it("2. updateProduct changes only supplied fields", async () => {
        const product = await makeProduct()
        const updated = await updateProduct(product.id, { title: "Service Updated Title" })
        expect(updated).toMatchObject({
            id: product.id,
            title: "Service Updated Title",
            handle: product.handle
        })
    })

    it("3. syncCommerceProduct handles missing CMS content and preserves CMS fields on resync", async () => {
        const commerceProductId = `service-commerce-${randomUUID()}`
        const input = {
            id: commerceProductId,
            title: "Synced Commerce Product",
            handle: `synced-${randomUUID()}`,
            description: "Synced description"
        }
        const first = await syncCommerceProduct(input)
        productIds.push(first!.id)
        expect(first).toMatchObject({
            cmsContentId: null,
            seoTitle: null,
            seoDescription: null,
            richContent: null,
            contentStatus: "missing"
        })
        const second = await syncCommerceProduct({ ...input, title: "Synced Commerce Product Again" })
        if (second!.id !== first!.id) productIds.push(second!.id)

        const cmsContentId = randomUUID()
        await syncCmsContent(commerceProductId, {
            cmsContentId,
            seoTitle: "Synced SEO title",
            seoDescription: "Synced SEO description",
            richContent: { body: "Synced CMS content" },
            contentStatus: "published"
        })
        const afterCmsResync = await syncCommerceProduct({
            ...input,
            title: "Synced Commerce Product After CMS Update"
        })

        const rows = await pool.query<{ title: string }>(
            "SELECT title FROM merged_products WHERE commerce_product_id = $1",
            [commerceProductId]
        )
        expect(rows.rowCount).toBe(1)
        expect(rows.rows[0]?.title).toBe("Synced Commerce Product After CMS Update")
        expect(afterCmsResync).toMatchObject({
            id: first!.id,
            cmsContentId,
            seoTitle: "Synced SEO title",
            seoDescription: "Synced SEO description",
            richContent: { body: "Synced CMS content" },
            contentStatus: "published"
        })
    })

    it("4. syncCmsContent updates CMS fields without changing commerce fields", async () => {
        const product = await makeProduct()
        const cmsContentId = randomUUID()
        const updated = await syncCmsContent(product.commerceProductId, {
            cmsContentId,
            seoTitle: "SEO Service Title",
            seoDescription: "SEO description",
            richContent: { sections: ["one"] },
            contentStatus: "published"
        })
        expect(updated).toMatchObject({
            cmsContentId,
            seoTitle: "SEO Service Title",
            title: product.title,
            handle: product.handle
        })
    })

    it("5. createVariant links to the correct product", async () => {
        const product = await makeProduct()
        const variant = await createVariant({
            commerceVariantId: `service-variant-${randomUUID()}`,
            productId: product.id,
            sku: "SERVICE-SKU",
            title: "Service Variant",
            options: { size: "M" },
            price: { amount: "1000" },
            inventoryQuantity: 3
        })
        variantIds.push(variant.id)
        expect(variant.productId).toBe(product.id)
    })

    it("6. updateVariant changes only supplied variant fields", async () => {
        const product = await makeProduct()
        const variant = await createVariant({
            commerceVariantId: `service-variant-${randomUUID()}`,
            productId: product.id,
            sku: "SERVICE-SKU",
            title: "Original Variant",
            options: { size: "M" },
            price: { amount: "1000" },
            inventoryQuantity: 3
        })
        variantIds.push(variant.id)
        const updated = await updateVariant(variant.commerceVariantId, { title: "Updated Variant" })
        expect(updated).toMatchObject({
            title: "Updated Variant",
            sku: "SERVICE-SKU",
            inventoryQuantity: 3
        })
    })

    it("7. syncVariantProduct updates the same variant on repeat sync", async () => {
        const product = await makeProduct()
        const data = {
            commerceVariantId: `service-sync-variant-${randomUUID()}`,
            productId: product.id,
            sku: "SYNC-SKU",
            title: "First Sync",
            options: { size: "S" },
            price: { amount: "900" },
            inventoryQuantity: 4
        }
        const first = await syncVariantProduct(data)
        variantIds.push(first.id)
        const second = await syncVariantProduct({ ...data, title: "Second Sync", inventoryQuantity: 7 })
        expect(second.id).toBe(first.id)
        expect(second).toMatchObject({ title: "Second Sync", inventoryQuantity: 7 })

        const found = await findVariantByCommerceId(data.commerceVariantId)
        expect(found?.title).toBe("Second Sync")
    })

    it("8. createVariant rejects an invalid parent product id", async () => {
        await expect(createVariant({
            commerceVariantId: `service-invalid-${randomUUID()}`,
            productId: randomUUID(),
            sku: null,
            title: "Invalid Parent",
            options: null,
            price: null,
            inventoryQuantity: null
        })).rejects.toThrow("Parent product not found")
    })
})
