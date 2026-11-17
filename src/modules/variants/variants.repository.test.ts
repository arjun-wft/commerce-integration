import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
    selectResult: [] as unknown[],
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
    createVariant,
    deleteVariantById,
    findVariantByCommerceId,
    findVariantById,
    findVariantByProductId,
    updateVariantByCommerceId,
    upsertVariant
} from "./variants.repository.js"

const variant = {
    id: "variant-1",
    commerceVariantId: "commerce-variant-1",
    productId: "product-1",
    sku: "TEST-SKU",
    title: "Test Variant"
}

describe("variants repository", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.selectResult = []
        mocks.insertReturning.mockResolvedValue([variant])
        mocks.updateReturning.mockResolvedValue([variant])
        mocks.deleteReturning.mockResolvedValue([variant])
    })

    it("creates a variant and returns it", async () => {
        await expect(createVariant(variant)).resolves.toEqual(variant)
        expect(mocks.insertReturning).toHaveBeenCalledOnce()
    })

    it("finds a variant by database id", async () => {
        mocks.selectResult = [variant]
        await expect(findVariantById("commerce-variant-1")).resolves.toEqual(variant)
    })

    it("finds a variant by commerce id", async () => {
        mocks.selectResult = [variant]
        await expect(findVariantByCommerceId("commerce-variant-1")).resolves.toEqual(variant)
    })

    it("returns null when a variant lookup has no result", async () => {
        await expect(findVariantByCommerceId("missing")).resolves.toBeNull()
    })

    it("finds variants by product id", async () => {
        mocks.selectResult = [variant]
        await expect(findVariantByProductId("product-1")).resolves.toEqual([variant])
    })

    it("updates a variant and adds an updated timestamp", async () => {
        await expect(updateVariantByCommerceId("commerce-variant-1", { title: "Updated Variant" })).resolves.toEqual(variant)
        expect(mocks.updateReturning).toHaveBeenCalledOnce()
    })

    it("returns null when the variant update has no result", async () => {
        mocks.updateReturning.mockResolvedValue([])
        await expect(updateVariantByCommerceId("missing", { title: "Missing" })).resolves.toBeNull()
    })

    it("upserts a variant", async () => {
        await expect(upsertVariant(variant)).resolves.toEqual(variant)
        expect(mocks.insertReturning).toHaveBeenCalledOnce()
    })

    it("deletes a variant and returns the deleted row", async () => {
        await expect(deleteVariantById("variant-1")).resolves.toEqual(variant)
        expect(mocks.deleteReturning).toHaveBeenCalledOnce()
    })

    it("returns null when deletion finds no variant", async () => {
        mocks.deleteReturning.mockResolvedValue([])
        await expect(deleteVariantById("missing")).resolves.toBeNull()
    })
})
