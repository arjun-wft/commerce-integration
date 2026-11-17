import { beforeAll, describe, expect, it, vi } from "vitest"
import {
    getMedusaProduct,
    getMedusaProducts,
    getMedusaVariant
} from "./meudsa.js"
import type { MedusaProductPage } from "./meudsa.js"

const TEST_TIMEOUT_MS = 15_000

async function findExistingProduct() {
    const page = await getMedusaProducts(10, 0)
    const product = page.products[0]
    if (!product)
        throw new Error("The Medusa store has no products to test against")

    return { page, product }
}

describe("Medusa Admin API integration", () => {
    beforeAll(async () => {
        const page = await getMedusaProducts(1, 0)
        expect(page.products).toBeInstanceOf(Array)
    }, TEST_TIMEOUT_MS)

    it("lists products with pagination and expanded variant fields", async () => {
        const page: MedusaProductPage = await getMedusaProducts(1, 0)

        expect(page).toMatchObject({
            products: expect.any(Array),
            count: expect.any(Number),
            limit: 1,
            offset: 0
        })

        const product = page.products[0]
        if (product) {
            expect(product).toHaveProperty("id")
            expect(product).toHaveProperty("variants")
            expect(product.variants).toBeInstanceOf(Array)

            const variant = product.variants[0]
            if (variant) {
                expect(variant).toHaveProperty("sku")
                expect(variant.options).toBeInstanceOf(Array)
                expect(variant.prices).toBeInstanceOf(Array)
            }
        }
    }, TEST_TIMEOUT_MS)

    it("gets one product by ID from the running Medusa server", async () => {
        const { product: listedProduct } = await findExistingProduct()
        const response = await getMedusaProduct(listedProduct.id)

        expect(response.product.id).toBe(listedProduct.id)
        expect(response.product.variants).toBeInstanceOf(Array)
    }, TEST_TIMEOUT_MS)

    it("gets a variant including SKU, options, prices and supported inventory", async () => {
        const { product } = await findExistingProduct()
        const listedVariant = product.variants.find((variant) => Boolean(variant.id))
        if (!listedVariant)
            throw new Error("The Medusa store has no product variants to test against")

        const variant = await getMedusaVariant(listedVariant.id)

        expect(variant).not.toBeNull()
        expect(variant?.id).toBe(listedVariant.id)
        expect(variant).toHaveProperty("sku")
        expect(variant?.options).toBeInstanceOf(Array)
        expect(variant?.prices).toBeInstanceOf(Array)
        expect(variant).toHaveProperty("manage_inventory")
        if (variant?.inventory_quantity !== undefined)
            expect(typeof variant.inventory_quantity).toBe("number")
    }, TEST_TIMEOUT_MS)

    it("returns null when the variant ID does not exist", async () => {
        await expect(getMedusaVariant("variant_integration_missing"))
            .resolves.toBeNull()
    }, TEST_TIMEOUT_MS)

    it("reports non-2xx product responses with the HTTP status", async () => {
        await expect(getMedusaProduct("prod_integration_missing"))
            .rejects.toThrow("Medusa Admin API error (404)")
    }, TEST_TIMEOUT_MS)

    it("rejects invalid pagination and empty IDs before making requests", async () => {
        await expect(getMedusaProducts(0, 0)).rejects.toThrow("limit")
        await expect(getMedusaProducts(1, -1)).rejects.toThrow("offset")
        await expect(getMedusaProduct(" ")).rejects.toThrow("productId")
        await expect(getMedusaVariant("")).rejects.toThrow("variantId")
    })

    it("reports missing Admin API configuration", async () => {
        const originalBaseUrl = process.env.MEDUSA_BASE_URL
        const originalSecretKey = process.env.MEDUSA_SECRET_KEY
        try {
            process.env.MEDUSA_BASE_URL = ""
            vi.resetModules()
            const missingBase = await import("./meudsa.js")
            await expect(missingBase.getMedusaProducts())
                .rejects.toThrow("MEDUSA_BASE_URL is required")

            if (originalBaseUrl === undefined)
                delete process.env.MEDUSA_BASE_URL
            else
                process.env.MEDUSA_BASE_URL = originalBaseUrl
            process.env.MEDUSA_SECRET_KEY = ""
            vi.resetModules()
            const missingSecret = await import("./meudsa.js")
            await expect(missingSecret.getMedusaProducts())
                .rejects.toThrow("MEDUSA_SECRET_KEY is required")
        } finally {
            if (originalBaseUrl === undefined)
                delete process.env.MEDUSA_BASE_URL
            else
                process.env.MEDUSA_BASE_URL = originalBaseUrl
            if (originalSecretKey === undefined)
                delete process.env.MEDUSA_SECRET_KEY
            else
                process.env.MEDUSA_SECRET_KEY = originalSecretKey
            vi.resetModules()
        }
    })
})
