import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { getDirectusProducts, type DirectusResponse } from "../../config/directus.js"
import type { MedusaProduct } from "../../config/meudsa.js"
import { getMedusaProducts } from "../../config/meudsa.js"
import { pool } from "../../config/database.js"
import { findProductByCommerceId } from "../products/products.repository.js"
import { syncCmsContent } from "../products/products.service.js"
import { findVariantByCommerceId } from "../variants/variants.repository.js"
import { runIntialSync } from "./initial-sync.service.js"

const PAGE_LIMIT = 50
const TEST_TIMEOUT_MS = 120_000

async function getEntireMedusaCatalog(): Promise<MedusaProduct[]> {
    const products: MedusaProduct[] = []
    let offset = 0
    let totalCount = 0

    do {
        const page = await getMedusaProducts(PAGE_LIMIT, offset)
        totalCount = page.count
        products.push(...page.products)

        if (page.products.length === 0)
            break
        if (page.limit < 1)
            throw new Error("Medusa returned a non-positive pagination limit")

        offset += page.limit
    } while (offset < totalCount)

    return products
}

async function getEntireDirectusCatalog(): Promise<DirectusResponse[]> {
    const records: DirectusResponse[] = []
    let offset = 0
    let totalCount = 0

    do {
        const page = await getDirectusProducts(PAGE_LIMIT, offset)
        totalCount = page.meta.total_count
        records.push(...page.data)

        if (page.data.length === 0)
            break
        offset += page.data.length
    } while (offset < totalCount)

    return records
}

async function findExistingCatalogRecords(products: MedusaProduct[]) {
    const productIds = products.map((product) => product.id)
    const variantIds = products.flatMap((product) =>
        product.variants.map((variant) => variant.id)
    )

    const [existingProducts, existingVariants] = await Promise.all([
        productIds.length
            ? pool.query<{ commerce_product_id: string }>(
                "SELECT commerce_product_id FROM merged_products WHERE commerce_product_id = ANY($1::varchar[])",
                [productIds]
            )
            : Promise.resolve({ rows: [] as { commerce_product_id: string }[] }),
        variantIds.length
            ? pool.query<{ commerce_variant_id: string }>(
                "SELECT commerce_variant_id FROM merged_variants WHERE commerce_variant_id = ANY($1::varchar[])",
                [variantIds]
            )
            : Promise.resolve({ rows: [] as { commerce_variant_id: string }[] })
    ])

    return {
        products: existingProducts.rows.map((row) => row.commerce_product_id),
        variants: existingVariants.rows.map((row) => row.commerce_variant_id)
    }
}

async function cleanupCatalogRecords(products: MedusaProduct[]) {
    const productIds = products.map((product) => product.id)
    const variantIds = products.flatMap((product) =>
        product.variants.map((variant) => variant.id)
    )

    if (variantIds.length) {
        await pool.query(
            "DELETE FROM merged_variants WHERE commerce_variant_id = ANY($1::varchar[])",
            [variantIds]
        )
    }
    if (productIds.length) {
        await pool.query(
            "DELETE FROM merged_products WHERE commerce_product_id = ANY($1::varchar[])",
            [productIds]
        )
    }
}

function stubInitialSyncApis(medusaProducts: MedusaProduct[]) {
    let medusaRequestCount = 0
    const jsonResponse = (body: unknown) => new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" }
    })
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const pathname = new URL(String(input)).pathname
        if (pathname.endsWith("/admin/products")) {
            const product = medusaProducts[
                Math.min(medusaRequestCount++, medusaProducts.length - 1)
            ]
            if (!product)
                throw new Error("No Medusa product configured for the integration test")

            return jsonResponse({
                products: [product],
                count: 1,
                limit: 50,
                offset: 0
            })
        }
        if (pathname.endsWith("/items/product_contents"))
            return jsonResponse({ data: [], meta: { total_count: 0 } })

        throw new Error(`Unexpected integration-test request: ${pathname}`)
    })
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {})
    vi.stubGlobal("fetch", fetchMock)

    return () => {
        vi.unstubAllGlobals()
        logSpy.mockRestore()
    }
}

describe("initial sync integration", () => {
    beforeAll(async () => {
        await pool.query("SELECT 1")
        const result = await pool.query(`
            SELECT
                current_database() AS database,
                current_schema() AS schema,
                current_schemas(true) AS search_path,
                (SELECT COUNT(*) FROM public.merged_products) AS products,
                (SELECT COUNT(*) FROM public.merged_variants) AS variants
        `)
        console.log("Database verification:", result.rows)
    })

    afterAll(async () => {
        await pool.end()
    })

    it("syncs the real Medusa catalog twice without duplicate PostgreSQL records", async (context) => {
        const catalog = await getEntireMedusaCatalog()
        const directusRecords = await getEntireDirectusCatalog()
        const catalogProductIds = new Set(catalog.map((product) => product.id))
        const matchedDirectusRecords = directusRecords.filter((record) =>
            catalogProductIds.has(record.medusa_product_id)
        )
        const expectedCmsContent = new Map(
            matchedDirectusRecords.map((record) => [record.medusa_product_id, record])
        )

        if (catalog.length > 0) {
            const existing = await findExistingCatalogRecords(catalog)
            if (existing.products.length || existing.variants.length) {
                console.log("Existing catalog records:", existing)
                context.skip(
                    "Catalog IDs already exist in PostgreSQL; skipping to preserve existing records"
                )
                return
            }
        }

        try {
            const firstSummary = await runIntialSync()
            const secondSummary = await runIntialSync()
            const expectedVariantCount = catalog.reduce(
                (count, product) => count + product.variants.length,
                0
            )
            const expectedCmsSummary = {
                totalCMSRecord: directusRecords.length,
                totalSyncedRecord: matchedDirectusRecords.length,
                totalCmsFailed: 0,
                unmatchedCmsRecord: directusRecords.length - matchedDirectusRecords.length
            }

            expect(matchedDirectusRecords.length).toBeGreaterThan(0)
            expect(matchedDirectusRecords.length).toBeLessThanOrEqual(catalog.length)

            console.log({
                totalMedusaProducts: catalog.length,
                totalDirectusRecords: directusRecords.length,
                matchedCMSRecords: matchedDirectusRecords.length,
                unmatchedCMSRecords:
                    directusRecords.length - matchedDirectusRecords.length,
                productsWithoutCMS:
                    catalog.length - matchedDirectusRecords.length
            })

            expect(firstSummary).toEqual({
                totalProducts: catalog.length,
                syncedProducts: catalog.length,
                failedProducts: 0,
                totalVariants: expectedVariantCount,
                syncedVariants: expectedVariantCount,
                failedVariants: 0,
                ...expectedCmsSummary
            })
            expect(secondSummary).toEqual(firstSummary)

            for (const medusaProduct of catalog) {
                const localProduct = await findProductByCommerceId(medusaProduct.id)
                expect(localProduct).not.toBeNull()
                expect(localProduct?.id).toMatch(
                    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
                )

                const productCount = await pool.query<{ count: number }>(
                    "SELECT COUNT(*)::int AS count FROM merged_products WHERE commerce_product_id = $1",
                    [medusaProduct.id]
                )
                expect(productCount.rows[0]?.count).toBe(1)

                const cmsContent = expectedCmsContent.get(medusaProduct.id)
                if (cmsContent) {
                    expect(localProduct).toMatchObject({
                        cmsContentId: cmsContent.id,
                        seoTitle: cmsContent.seo_title,
                        seoDescription: cmsContent.seo_description,
                        richContent: cmsContent.rich_content,
                        contentStatus: cmsContent.content_status
                    })
                } else {
                    expect(localProduct).toMatchObject({
                        cmsContentId: null,
                        seoTitle: null,
                        seoDescription: null,
                        richContent: null,
                        contentStatus: "missing"
                    })
                }

                for (const medusaVariant of medusaProduct.variants) {
                    const localVariant = await findVariantByCommerceId(medusaVariant.id)
                    expect(localVariant).not.toBeNull()
                    expect(localVariant?.productId).toBe(localProduct?.id)

                    const variantCount = await pool.query<{ count: number }>(
                        "SELECT COUNT(*)::int AS count FROM merged_variants WHERE commerce_variant_id = $1",
                        [medusaVariant.id]
                    )
                    expect(variantCount.rows[0]?.count).toBe(1)
                }
            }

            const secondSyncCmsSummary = {
                totalCMSRecord: secondSummary.totalCMSRecord,
                totalSyncedRecord: secondSummary.totalSyncedRecord,
                totalCmsFailed: secondSummary.totalCmsFailed,
                unmatchedCmsRecord: secondSummary.unmatchedCmsRecord
            }
            expect(secondSyncCmsSummary).toEqual(expectedCmsSummary)
        } finally {
            if (catalog.length)
                await cleanupCatalogRecords(catalog)
        }
    }, TEST_TIMEOUT_MS)

    it("syncs a Medusa product without CMS content and keeps CMS fields missing", async () => {
        const commerceProductId = `integration-missing-cms-${randomUUID()}`
        const product = {
            id: commerceProductId,
            title: "Product without CMS content",
            handle: commerceProductId,
            description: "CMS content is intentionally absent",
            variants: []
        }
        const restoreMocks = stubInitialSyncApis([product])

        try {
            const firstSummary = await runIntialSync()
            const firstProduct = await findProductByCommerceId(commerceProductId)
            expect(firstSummary.syncedProducts).toBe(1)
            expect(firstSummary.unmatchedCmsRecord).toBe(0)
            expect(firstProduct).toMatchObject({
                commerceProductId,
                cmsContentId: null,
                seoTitle: null,
                seoDescription: null,
                richContent: null,
                contentStatus: "missing"
            })

            const secondSummary = await runIntialSync()
            const productCount = await pool.query<{ count: number }>(
                "SELECT COUNT(*)::int AS count FROM merged_products WHERE commerce_product_id = $1",
                [commerceProductId]
            )
            expect(secondSummary.syncedProducts).toBe(1)
            expect(productCount.rows[0]?.count).toBe(1)
            const productAfterSecondSync = await findProductByCommerceId(commerceProductId)
            expect(productAfterSecondSync).toMatchObject({
                commerceProductId,
                cmsContentId: null,
                seoTitle: null,
                seoDescription: null,
                richContent: null,
                contentStatus: "missing"
            })
        } finally {
            restoreMocks()
            await pool.query(
                "DELETE FROM merged_products WHERE commerce_product_id = $1",
                [commerceProductId]
            )
        }
    }, TEST_TIMEOUT_MS)

    it("preserves Directus-owned CMS fields when Medusa resyncs the product", async () => {
        const commerceProductId = `integration-cms-owner-${randomUUID()}`
        const product = {
            id: commerceProductId,
            title: "Product before CMS update",
            handle: commerceProductId,
            description: "Commerce description",
            variants: []
        }
        const updatedProduct = {
            ...product,
            title: "Medusa title after resync"
        }
        const restoreMocks = stubInitialSyncApis([product, updatedProduct])

        try {
            const firstSummary = await runIntialSync()
            expect(firstSummary.syncedProducts).toBe(1)

            const cmsContentId = randomUUID()
            await syncCmsContent(commerceProductId, {
                cmsContentId,
                seoTitle: "Directus-owned SEO title",
                seoDescription: "Directus-owned SEO description",
                richContent: { body: "Directus-owned rich content" },
                contentStatus: "published"
            })

            const secondSummary = await runIntialSync()
            const productAfterResync = await findProductByCommerceId(commerceProductId)
            const productCount = await pool.query<{ count: number }>(
                "SELECT COUNT(*)::int AS count FROM merged_products WHERE commerce_product_id = $1",
                [commerceProductId]
            )

            expect(secondSummary.syncedProducts).toBe(1)
            expect(productCount.rows[0]?.count).toBe(1)
            expect(productAfterResync).toMatchObject({
                commerceProductId,
                title: updatedProduct.title,
                cmsContentId,
                seoTitle: "Directus-owned SEO title",
                seoDescription: "Directus-owned SEO description",
                richContent: { body: "Directus-owned rich content" },
                contentStatus: "published"
            })
        } finally {
            restoreMocks()
            await pool.query(
                "DELETE FROM merged_products WHERE commerce_product_id = $1",
                [commerceProductId]
            )
        }
    }, TEST_TIMEOUT_MS)
})
