import { Worker } from "bullmq"
import redis from "../config/redis.js"
import { updateWebhook } from "../modules/webhooks/webhook.service.js"
import { getMedusaProduct, getMedusaVariant } from "../config/meudsa.js"
import { deleteProductByCommerceId, getProductByCommerceId, syncCommerceProduct, updateProductByCommerceId } from "../modules/products/products.service.js"
import { syncVariantProduct, deleteByVariantId } from "../modules/variants/variants.service.js"
import type { Product } from "../modules/products/products.types.js"

export async function handleProductsOperation(webhookEventId: string, externalEventId: string, eventType: string, payload: any) {
    const operation = eventType.split('.')[1]
    let product;

    switch (operation) {
        case "created":
        case "updated":
            product = (await getMedusaProduct(payload.id)).product
            return await syncCommerceProduct({
                id: product.id,
                description: product.description,
                handle: product.handle,
                title: product.title,
            })

        case "deleted":
            return await deleteProductByCommerceId(payload.id)

        default:
            throw new Error(`Unsupported product event: ${eventType}`)
    }
}

export async function handleVariantsOperation(webhookEventId: string, externalEventId: string, eventType: string, payload: any) {
    const operation = eventType.split('.')[1]

    switch (operation) {
        case 'created':
        case 'updated':
            // Fetch Vairant Data
            const variant = await getMedusaVariant(payload.id)
            if (!variant) {
                throw new Error(`Medusa variant not found: ${payload.id}`)
            }

            // Fetch Product Id
            let localProduct: Product | null = await getProductByCommerceId(variant?.product_id)
            if (!localProduct) {
                // Find Product from Meudsa
                const { product } = await getMedusaProduct(variant.product_id)

                // Insert this product
                const productResult = await syncCommerceProduct({
                    id: product.id,
                    description: product.description,
                    handle: product.handle,
                    title: product.title
                })

                if (!productResult) {
                    throw new Error(`Parent product sync failed: ${product.id}`)
                }

                localProduct = productResult;

                console.log("Product webhook processed:", {
                    commerceProductId: productResult.commerceProductId,
                    localProductId: productResult.id
                })

            }

            if (!localProduct) {
                throw new Error(`Unable to find parent product: ${variant.product_id}`);
            }

            // Insert current vairant
            const variantResult = await syncVariantProduct({
                commerceVariantId: variant.id,
                price: variant.prices,
                options: variant.options,
                sku: variant.sku,
                title: variant.title,
                inventoryQuantity: variant.inventory_quantity ?? null,
                productId: localProduct.id
            })

            if (!variantResult) {
                throw new Error(`Variant sync failed: ${variant.id}`);
            }

            console.log("Variant synced:", {
                commerceVariantId: variantResult.commerceVariantId,
                localVariantId: variantResult.id,
                localProductId: localProduct.id
            })

            return variant

        case "deleted":
            return await deleteByVariantId(payload.id)

        default:
            throw new Error(`Unsupported variant event: ${eventType}`);
    }
}

export const productSyncWorker = new Worker('product-sync', async (job) => {

    // Update the status to processing
    await updateWebhook(job.data.webhookEventId, { status: 'processing' })
    console.log('Processing Started ', job.id)

    const { eventType, webhookEventId, externalEventId, payload } = job.data

    const result = eventType.startsWith('product-variant') ? await handleVariantsOperation(webhookEventId, externalEventId, eventType, payload)
        : await handleProductsOperation(webhookEventId, externalEventId, eventType, payload)

    // Logic
    await updateWebhook(job.data.webhookEventId, { status: 'completed' })
    console.log('Processing Ended ', job.id)

    return {
        success: true,
        processedProductId: job.data.payload.id
    }
}, {
    connection: redis,
    concurrency: 1,
    autorun: true
})

productSyncWorker.on('failed', async (job, error) => {
    if (!job)
        return

    if (job.attemptsMade >= (job.opts.attempts ?? 1)) {
        await updateWebhook(job.data.webhookEventId, { status: 'failed', errorMessage: error.message })
    }
})

productSyncWorker.on("stalled", (jobId) => {
    console.log("Medusa STALLED:", jobId)
})

productSyncWorker.on("ready", () => {
    console.log("Medusa Worker is ready")
})

productSyncWorker.on("active", (job) => {
    console.log("Medusa Job active:", job.id)
})

productSyncWorker.on("completed", (job) => {
    console.log("Medusa Job completed:", job.id)
})

productSyncWorker.on("error", (error) => {
    console.error("Medusa Worker error:", error)
})

productSyncWorker.on("failed", async (job, error) => {
    if (!job) return

    console.error("JOB FAILED:", job.id)
    console.dir(error, { depth: null })

    console.error("ERROR CAUSE:")
    console.dir((error as any).cause, { depth: null })

    if (job.attemptsMade >= (job.opts.attempts ?? 1)) {
        await updateWebhook(job.data.webhookEventId, {
            status: 'failed',
            errorMessage: error.message
        })
    }
})