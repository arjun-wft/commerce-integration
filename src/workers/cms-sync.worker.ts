import { Worker } from "bullmq"
import redis from "../config/redis.js"
import { updateWebhook } from "../modules/webhooks/webhook.service.js"
import { getDirectusProductById } from "../config/directus.js"
import { removeCmsContent, syncCmsContent } from "../modules/products/products.service.js"

export const cmsSyncWorker = new Worker('cms-sync', async (job) => {

    // Update the status to processing
    await updateWebhook(job.data.webhookEventId, { status: 'processing' })

    const { collection, keys } = job.data.payload
    console.log(collection, keys)

    if (collection !== "product_contents") {
        throw new Error(`Unsupported collection: ${collection}`)
    }

    if (!Array.isArray(keys) || keys.length === 0) {
        throw new Error("No Directus Keys Are Present To Update")
    }

    const eventType = job.data.eventType

    if (eventType !== "product_contents.items.create" && eventType !== "product_contents.items.update" && eventType !== "product_contents.items.delete") {
        throw new Error(`Unsupported Directus event: ${eventType}`)
    }

    for (let key of keys) {

        if (job.data.eventType === 'product_contents.items.delete') {
            const result = await removeCmsContent(key)

            console.log("CMS Content Unlinked:", {
                cmsContentId: key,
                unlinkedCount: result.unlinkedCount
            })

            continue
        }

        const content = await getDirectusProductById(key)  // Get Directus Latest Data Why Because Directus Only Send Updated Fields Not All

        if (!content.medusa_product_id) {
            console.log("Medusa ID not found")
            throw new Error(`Medusa product ID missing for CMS item: ${key}`)
        }

        // Insert or Update auto handle by worker

        try {
            const res = await syncCmsContent(content.medusa_product_id, {
                cmsContentId: content.id,
                contentStatus: content.content_status,
                seoTitle: content.seo_title,
                seoDescription: content.seo_description,
                richContent: content.rich_content,
            })

            console.log(`CMS Updated ${res}`)
        }
        catch (error: any) {
            if(error.message == 'Commerce product not found for CMS content'){
                console.log("Skipping Unmapped Product")
                continue    
            }

            throw error
        }
    }

    // Logic
    await updateWebhook(job.data.webhookEventId, { status: 'completed' })
    console.log('CMS Completed: ', job.data)

    return {
        success: true,
        processedCmsContentId: keys
    }
}, {
    connection: redis,
    concurrency: 1,
    autorun: true
})

cmsSyncWorker.on('failed', async (job, error) => {
    if (!job)
        return

    if (job.attemptsMade >= (job.opts.attempts || 1)) {
        await updateWebhook(job.data.webhookEventId, { status: 'failed', errorMessage: error.message })
    }
})

cmsSyncWorker.on("ready", () => {
    console.log("Cms Worker is ready")
})

cmsSyncWorker.on("active", (job) => {
    console.log("Cms Job active:", job.id)
})

cmsSyncWorker.on("completed", (job) => {
    console.log("Cms Job completed:", job.id)
})

cmsSyncWorker.on("error", (error) => {
    console.error("Cms Worker error:", error)
})