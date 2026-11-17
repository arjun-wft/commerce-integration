import { getDirectusProducts, type DirectusResponse, type DirectusResult } from "../../config/directus.js"
import { getMedusaProducts, type MedusaProduct } from "../../config/meudsa.js"
import { syncCommerceProduct } from "../products/products.service.js"
import { syncVariantProduct } from "../variants/variants.service.js"
import { updateFromDirectus } from "../products/products.repository.js"

export interface IntitalSyncSummary {
    totalProducts: number,
    syncedProducts: number,
    failedProducts: number,

    totalVariants: number,
    syncedVariants: number,
    failedVariants: number,

    totalCMSRecord: number,
    totalSyncedRecord: number,
    totalCmsFailed: number,
    unmatchedCmsRecord: number
}

export async function runIntialSync() {
    try {
        const medusaLimit = 50
        let medusaOffset = 0
        let totalMedusaCount = 0

        const summary: IntitalSyncSummary = {
            totalProducts: 0,
            syncedProducts: 0,
            failedProducts: 0,
            totalVariants: 0,
            syncedVariants: 0,
            failedVariants: 0,
            totalCmsFailed: 0,
            totalCMSRecord: 0,
            totalSyncedRecord: 0,
            unmatchedCmsRecord: 0
        }

        do {
            const page = await getMedusaProducts(medusaLimit, medusaOffset)
            totalMedusaCount = page.count

            // Process Products
            for (const product of page.products as MedusaProduct[]) {
                // Upsert the product
                let localProduct;
                summary.totalProducts++

                try {
                    localProduct = await syncCommerceProduct({
                        id: product.id,
                        description: product.description,
                        handle: product.handle,
                        title: product.title
                    })

                    // Product must have id from postgree database
                    if (!localProduct?.id) {
                        throw new Error(`Product sync failed: ${product.id}`)
                    }

                    summary.syncedProducts++
                }
                catch (error: any) {
                    summary.failedProducts++
                    console.error("Failed Product:", {
                        productId: product.id,
                        error: error instanceof Error ? error.message : error
                    })
                    continue
                }

                // Process their variants
                for (const variant of product.variants ?? []) {
                    let localVariantOfParentProduct;
                    summary.totalVariants++

                    try {
                        localVariantOfParentProduct = await syncVariantProduct({
                            commerceVariantId: variant.id,
                            inventoryQuantity: variant.inventory_quantity ?? null,
                            options: variant.options,
                            price: variant.prices,
                            productId: localProduct?.id,
                            sku: variant.sku,
                            title: variant.title
                        })

                        if (localVariantOfParentProduct) {
                            summary.syncedVariants++
                        } else {
                            summary.failedVariants++
                        }
                    }
                    catch (error: any) {
                        summary.failedVariants++
                        console.error("Failed Variant:", {
                            variantId: variant.id,
                            productId: product.id,
                            error: error instanceof Error ? error.message : error
                        })
                    }
                }
            }

            console.log(page.products)
            medusaOffset += page.limit

        } while (medusaOffset < totalMedusaCount)


        // Directus Fetch and Sync.
        const directusLimit = 20
        let directusOffset = 0
        let totalDirectusCount = 0

        do {
            const page = await getDirectusProducts(directusLimit, directusOffset)
            totalDirectusCount = page.meta.total_count
            summary.totalCMSRecord += page.data.length


            for (const directusContent of page.data as DirectusResponse[]) {
                // Update Merged Products Table From Directus
                try {
                    const updatedProductFromDirectus = await updateFromDirectus(directusContent.medusa_product_id, {
                        cmsContentId: directusContent.id,
                        contentStatus: directusContent.content_status,
                        richContent: directusContent.rich_content,
                        seoDescription: directusContent.seo_description,
                        seoTitle: directusContent.seo_title,
                    })

                    if (!updatedProductFromDirectus) {
                        summary.unmatchedCmsRecord++
                    } else {
                        summary.totalSyncedRecord++
                    }
                }
                catch (error: any) {
                    summary.totalCmsFailed++
                    console.log(`Error While Processing This CMS Record: `, error)
                }
            }
            directusOffset += directusLimit

        } while (directusOffset < totalDirectusCount);

        return summary
    }
    catch (error: any) {
        console.log(`Error while processing Meudsa products: `, error)
        throw error
    }

}
