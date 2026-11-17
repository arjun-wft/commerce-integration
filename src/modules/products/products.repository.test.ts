import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
    selectResult: [] as unknown[],
    selectReturning: vi.fn(),
    insertReturning: vi.fn(),
    updateReturning: vi.fn(),
    deleteReturning: vi.fn(),
}))

vi.mock("../../config/drizzle.js", () => ({
    db: {
        select: vi.fn(() => ({
            from: vi.fn(() => {
                const query = Promise.resolve(mocks.selectResult) as Promise<unknown[]> & {
                    where: ReturnType<typeof vi.fn>
                }
                query.where = vi.fn(() => Promise.resolve(mocks.selectResult))
                return query
            })
        })),
        insert: vi.fn(() => ({
            values: vi.fn(() => ({
                returning: mocks.insertReturning,
                onConflictDoUpdate: vi.fn(() => ({ returning: mocks.insertReturning }))
            }))
        })),
        update: vi.fn(() => ({
            set: vi.fn(() => ({
                where: vi.fn(() => ({ returning: mocks.updateReturning }))
            }))
        })),
        delete: vi.fn(() => ({
            where: vi.fn(() => ({ returning: mocks.deleteReturning }))
        }))
    }
}))

vi.mock("drizzle-orm", () => ({
    eq: vi.fn((column, value) => ({ column, value }))
}))

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

const product = {
    id: "product-1",
    commerceProductId: "commerce-1",
    title: "Test Product",
    handle: "test-product"
}

describe("products repository", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.selectResult = []
        mocks.selectReturning.mockResolvedValue([])
        mocks.insertReturning.mockResolvedValue([product])
        mocks.updateReturning.mockResolvedValue([product])
        mocks.deleteReturning.mockResolvedValue([product])
    })

    it("creates a product and returns it", async () => {
        await expect(createProduct(product)).resolves.toEqual(product)
        expect(mocks.insertReturning).toHaveBeenCalledOnce()
    })

    it("finds a product by database id", async () => {
        mocks.selectResult = [product]
        await expect(findProductById("product-1")).resolves.toEqual(product)
    })

    it("finds a product by commerce id", async () => {
        mocks.selectResult = [product]
        await expect(findProductByCommerceId("commerce-1")).resolves.toEqual(product)
    })

    it("finds a product by handle", async () => {
        mocks.selectResult = [product]
        await expect(findByHandle("test-product")).resolves.toEqual(product)
    })

    it("returns null when a product lookup has no result", async () => {
        await expect(findProductById("missing")).resolves.toBeNull()
    })

    it("returns all products", async () => {
        mocks.selectResult = [product]
        await expect(findAllProducts()).resolves.toEqual([product])
    })

    it("updates a product and adds an updated timestamp", async () => {
        await expect(updateProduct("product-1", { title: "Updated Product" })).resolves.toEqual(product)
        expect(mocks.updateReturning).toHaveBeenCalledOnce()
    })

    it("returns null when the product update has no result", async () => {
        mocks.updateReturning.mockResolvedValue([])
        await expect(updateProduct("missing", { title: "Missing" })).resolves.toBeNull()
    })

    it("upserts a product", async () => {
        await expect(upsertProduct(product)).resolves.toEqual(product)
        expect(mocks.insertReturning).toHaveBeenCalledOnce()
    })

    it("updates CMS data from Directus", async () => {
        const cmsData = {
            cmsContentId: "cms-1",
            seoTitle: "SEO title",
            seoDescription: "SEO description",
            richContent: { body: "Content" },
            contentStatus: "published"
        }
        await expect(updateFromDirectus("commerce-1", cmsData)).resolves.toEqual(product)
        expect(mocks.updateReturning).toHaveBeenCalledOnce()
    })

    it("deletes a product and returns the deleted row", async () => {
        await expect(deleteProduct("product-1")).resolves.toEqual(product)
        expect(mocks.deleteReturning).toHaveBeenCalledOnce()
    })

    it("returns null when deletion finds no product", async () => {
        mocks.deleteReturning.mockResolvedValue([])
        await expect(deleteProduct("missing")).resolves.toBeNull()
    })
})
