import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { DirectusResponse } from "../../config/directus.js"
import type { MedusaProduct, MedusaProductVariant } from "../../config/meudsa.js"
import type { Product } from "../products/products.types.js"

vi.mock("../../config/directus.js", () => ({
    getDirectusProducts: vi.fn()
}))

vi.mock("../../config/meudsa.js", () => ({
    getMedusaProducts: vi.fn()
}))

vi.mock("../products/products.repository.js", () => ({
    updateFromDirectus: vi.fn()
}))

vi.mock("../products/products.service.js", () => ({
    syncCommerceProduct: vi.fn()
}))

vi.mock("../variants/variants.service.js", () => ({
    syncVariantProduct: vi.fn()
}))

import {
    runIntialSync
} from "./initial-sync.service.js"
import { getDirectusProducts } from "../../config/directus.js"
import { getMedusaProducts } from "../../config/meudsa.js"
import { updateFromDirectus } from "../products/products.repository.js"
import { syncCommerceProduct } from "../products/products.service.js"
import { syncVariantProduct } from "../variants/variants.service.js"

const getDirectus = vi.mocked(getDirectusProducts)
const getProducts = vi.mocked(getMedusaProducts)
const updateCmsContent = vi.mocked(updateFromDirectus)
const syncProduct = vi.mocked(syncCommerceProduct)
const syncVariant = vi.mocked(syncVariantProduct)

const localProduct: Product = {
    id: "local-product-id",
    commerceProductId: "commerce-product-id",
    cmsContentId: null,
    title: "Test product",
    handle: "test-product",
    description: "Test description",
    seoTitle: null,
    seoDescription: null,
    richContent: null,
    contentStatus: "missing",
    lastSyncedAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z")
}

function medusaVariant(id: string): MedusaProductVariant {
    return {
        id,
        title: `Variant ${id}`,
        product_id: "commerce-product-id",
        sku: `${id}-sku`,
        manage_inventory: true,
        allow_backorder: false,
        inventory_quantity: 5,
        options: [{
            id: `option-value-${id}`,
            value: "Small",
            option_id: "size-option"
        }],
        prices: [{
            id: `price-${id}`,
            amount: 100,
            currency_code: "usd"
        }]
    }
}

function medusaProduct(
    id: string,
    variants: MedusaProductVariant[] = []
): MedusaProduct {
    return {
        id,
        title: `Product ${id}`,
        handle: `${id}-handle`,
        description: `${id} description`,
        variants
    }
}

function productPage(
    products: MedusaProduct[],
    count: number,
    limit = 50,
    offset = 0
) {
    return { products, count, limit, offset }
}

describe("initial sync service", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.spyOn(console, "log").mockImplementation(() => { })
        getProducts.mockResolvedValue(productPage([], 0))
        getDirectus.mockResolvedValue({ data: [], meta: { total_count: 0 } })
        updateCmsContent.mockResolvedValue(null)
        syncProduct.mockResolvedValue(localProduct)
        syncVariant.mockResolvedValue({} as Awaited<ReturnType<typeof syncVariantProduct>>)
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it("syncs a product and its variant and increments successful counters", async () => {
        getProducts.mockResolvedValue(productPage([
            medusaProduct("commerce-product-id", [medusaVariant("variant-1")])
        ], 1))
        syncVariant.mockResolvedValue({} as Awaited<ReturnType<typeof syncVariantProduct>>)

        const summary = await runIntialSync()

        expect(syncProduct).toHaveBeenCalledWith({
            id: "commerce-product-id",
            description: "commerce-product-id description",
            handle: "commerce-product-id-handle",
            title: "Product commerce-product-id"
        })
        expect(syncVariant).toHaveBeenCalledWith(expect.objectContaining({
            commerceVariantId: "variant-1",
            productId: localProduct.id,
            sku: "variant-1-sku",
            title: "Variant variant-1",
            inventoryQuantity: 5
        }))
        expect(summary).toEqual({
            totalProducts: 1,
            syncedProducts: 1,
            failedProducts: 0,
            totalVariants: 1,
            syncedVariants: 1,
            failedVariants: 0,
            totalCMSRecord: 0,
            totalSyncedRecord: 0,
            totalCmsFailed: 0,
            unmatchedCmsRecord: 0
        })
    })

    it("processes multiple products and completes each product before its variants", async () => {
        const firstProduct = medusaProduct("product-1", [medusaVariant("variant-1")])
        const secondProduct = medusaProduct("product-2", [medusaVariant("variant-2")])
        const callOrder: string[] = []
        getProducts.mockResolvedValue(productPage([firstProduct, secondProduct], 2))
        syncProduct.mockImplementation(async ({ id }) => {
            callOrder.push(`product:${id}`)
            return { ...localProduct, id: `local-${id}` }
        })
        syncVariant.mockImplementation(async ({ commerceVariantId }) => {
            callOrder.push(`variant:${commerceVariantId}`)
            return {} as Awaited<ReturnType<typeof syncVariantProduct>>
        })

        const summary = await runIntialSync()

        expect(callOrder).toEqual([
            "product:product-1",
            "variant:variant-1",
            "product:product-2",
            "variant:variant-2"
        ])
        expect(summary).toEqual({
            totalProducts: 2,
            syncedProducts: 2,
            failedProducts: 0,
            totalVariants: 2,
            syncedVariants: 2,
            failedVariants: 0,
            totalCMSRecord: 0,
            totalSyncedRecord: 0,
            totalCmsFailed: 0,
            unmatchedCmsRecord: 0
        })
    })

    it("skips a failed product's variants and continues with the next product", async () => {
        getProducts.mockResolvedValue(productPage([
            medusaProduct("bad-product", [medusaVariant("skipped-variant")]),
            medusaProduct("good-product", [medusaVariant("processed-variant")])
        ], 2))
        syncProduct
            .mockRejectedValueOnce(new Error("product upsert failed"))
            .mockResolvedValueOnce({ ...localProduct, id: "local-good-product" })
        syncVariant.mockResolvedValue({} as Awaited<ReturnType<typeof syncVariantProduct>>)

        const summary = await runIntialSync()

        expect(syncVariant).toHaveBeenCalledOnce()
        expect(syncVariant).toHaveBeenCalledWith(expect.objectContaining({
            commerceVariantId: "processed-variant",
            productId: "local-good-product"
        }))
        expect(summary).toEqual({
            totalProducts: 2,
            syncedProducts: 1,
            failedProducts: 1,
            totalVariants: 1,
            syncedVariants: 1,
            failedVariants: 0,
            totalCMSRecord: 0,
            totalSyncedRecord: 0,
            totalCmsFailed: 0,
            unmatchedCmsRecord: 0
        })
    })

    it("continues after a variant error and counts each variant outcome", async () => {
        getProducts.mockResolvedValue(productPage([
            medusaProduct("commerce-product-id", [
                medusaVariant("variant-fails"),
                medusaVariant("variant-succeeds")
            ])
        ], 1))
        syncVariant
            .mockRejectedValueOnce(new Error("variant upsert failed"))
            .mockResolvedValueOnce({} as Awaited<ReturnType<typeof syncVariantProduct>>)

        const summary = await runIntialSync()

        expect(syncVariant).toHaveBeenCalledTimes(2)
        expect(syncVariant).toHaveBeenNthCalledWith(1, expect.objectContaining({
            commerceVariantId: "variant-fails",
            productId: localProduct.id
        }))
        expect(syncVariant).toHaveBeenNthCalledWith(2, expect.objectContaining({
            commerceVariantId: "variant-succeeds",
            productId: localProduct.id
        }))
        expect(summary).toEqual({
            totalProducts: 1,
            syncedProducts: 1,
            failedProducts: 0,
            totalVariants: 2,
            syncedVariants: 1,
            failedVariants: 1,
            totalCMSRecord: 0,
            totalSyncedRecord: 0,
            totalCmsFailed: 0,
            unmatchedCmsRecord: 0
        })
    })

    it("fetches every page using the configured limit and increasing offsets", async () => {
        getProducts
            .mockResolvedValueOnce(productPage([medusaProduct("product-1")], 75, 50, 0))
            .mockResolvedValueOnce(productPage([medusaProduct("product-2")], 75, 50, 50))

        const summary = await runIntialSync()

        expect(getProducts).toHaveBeenNthCalledWith(1, 50, 0)
        expect(getProducts).toHaveBeenNthCalledWith(2, 50, 50)
        expect(getProducts).toHaveBeenCalledTimes(2)
        expect(summary.totalProducts).toBe(2)
        expect(summary.syncedProducts).toBe(2)
    })

    it("stops fetching once the total product count has been reached", async () => {
        getProducts.mockResolvedValue(productPage([
            medusaProduct("only-product")
        ], 1, 50, 0))

        await runIntialSync()

        expect(getProducts).toHaveBeenCalledOnce()
    })

    it("handles an empty page without attempting product or variant sync", async () => {
        getProducts.mockResolvedValue(productPage([], 0))

        const summary = await runIntialSync()

        expect(getProducts).toHaveBeenNthCalledWith(1, 50, 0)
        expect(getProducts).toHaveBeenCalledOnce()
        expect(syncProduct).not.toHaveBeenCalled()
        expect(syncVariant).not.toHaveBeenCalled()
        expect(summary).toEqual({
            totalProducts: 0,
            syncedProducts: 0,
            failedProducts: 0,
            totalVariants: 0,
            syncedVariants: 0,
            failedVariants: 0,
            totalCMSRecord: 0,
            totalSyncedRecord: 0,
            totalCmsFailed: 0,
            unmatchedCmsRecord: 0
        })
    })

    it("counts fetched, matched and unmatched Directus records", async () => {
        const cmsRecord: DirectusResponse = {
            id: "cms-content-id",
            medusa_product_id: "commerce-product-id",
            seo_title: "CMS SEO title",
            seo_description: "CMS SEO description",
            rich_content: '{"body":"CMS content"}',
            content_status: "published"
        }
        getDirectus.mockResolvedValue({
            data: [
                cmsRecord,
                { ...cmsRecord, id: "unmatched-cms-id", medusa_product_id: "missing-product" }
            ],
            meta: { total_count: 2 }
        })
        updateCmsContent.mockImplementation(async (commerceProductId) =>
            commerceProductId === cmsRecord.medusa_product_id ? localProduct : null
        )

        const summary = await runIntialSync()

        expect(updateCmsContent).toHaveBeenNthCalledWith(1, cmsRecord.medusa_product_id, {
            cmsContentId: cmsRecord.id,
            contentStatus: cmsRecord.content_status,
            richContent: cmsRecord.rich_content,
            seoDescription: cmsRecord.seo_description,
            seoTitle: cmsRecord.seo_title
        })
        expect(summary).toMatchObject({
            totalCMSRecord: 2,
            totalSyncedRecord: 1,
            totalCmsFailed: 0,
            unmatchedCmsRecord: 1
        })
    })

    it("continues processing remaining CMS records when one CMS update fails", async () => {
        const cmsRecords: DirectusResponse[] = [
            {
                id: "cms-1",
                medusa_product_id: "product-1",
                seo_title: "SEO 1",
                seo_description: "Description 1",
                rich_content: "<p>Content 1</p>",
                content_status: "published",
            },
            {
                id: "cms-2",
                medusa_product_id: "product-2",
                seo_title: "SEO 2",
                seo_description: "Description 2",
                rich_content: "<p>Content 2</p>",
                content_status: "published",
            },
        ];

        getDirectus.mockResolvedValue({
            data: cmsRecords,
            meta: { total_count: 2 },
        });

        updateCmsContent
            .mockRejectedValueOnce(new Error("Database update failed"))
            .mockResolvedValueOnce(localProduct);

        const summary = await runIntialSync();

        expect(updateCmsContent).toHaveBeenCalledTimes(2);
        expect(summary.totalCMSRecord).toBe(2);
        expect(summary.totalSyncedRecord).toBe(1);
        expect(summary.totalCmsFailed).toBe(1);
    });

    it("fetches every Directus page using increasing offsets", async () => {
        const cmsRecord: DirectusResponse = {
            id: "cms-1",
            medusa_product_id: "product-1",
            seo_title: "SEO title",
            seo_description: "SEO description",
            rich_content: "<p>Content</p>",
            content_status: "published"
        }

        getDirectus
            .mockResolvedValueOnce({
                data: [cmsRecord],
                meta: { total_count: 25 }
            })
            .mockResolvedValueOnce({
                data: [{ ...cmsRecord, id: "cms-2" }],
                meta: { total_count: 25 }
            })
        updateCmsContent.mockResolvedValue(localProduct)

        const summary = await runIntialSync()

        expect(getDirectus).toHaveBeenNthCalledWith(1, 20, 0)
        expect(getDirectus).toHaveBeenNthCalledWith(2, 20, 20)
        expect(getDirectus).toHaveBeenCalledTimes(2)
        expect(summary.totalCMSRecord).toBe(2)
        expect(summary.totalSyncedRecord).toBe(2)
    })

    it("propagates errors when fetching a page fails", async () => {
        const error = new Error("Medusa API unavailable")
        getProducts.mockRejectedValue(error)

        await expect(runIntialSync()).rejects.toBe(error)
        expect(syncProduct).not.toHaveBeenCalled()
        expect(syncVariant).not.toHaveBeenCalled()
    })

    it("counts a product sync that returns no local product as a failure", async () => {
        getProducts.mockResolvedValue(productPage([
            medusaProduct("missing-local-product", [medusaVariant("must-not-sync")])
        ], 1))
        syncProduct.mockResolvedValue({ ...localProduct, id: "" })

        const summary = await runIntialSync()

        expect(syncVariant).not.toHaveBeenCalled()
        expect(summary).toEqual({
            totalProducts: 1,
            syncedProducts: 0,
            failedProducts: 1,
            totalVariants: 0,
            syncedVariants: 0,
            failedVariants: 0,
            totalCMSRecord: 0,
            totalSyncedRecord: 0,
            totalCmsFailed: 0,
            unmatchedCmsRecord: 0
        })
    })

})
