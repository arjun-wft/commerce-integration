import { Queue, QueueEvents, Worker } from "bullmq"
import redis from "../config/redis.js"
import { cmsSyncQueue } from "../queue/cms-sync.queue.js"
import { productSyncQueue } from "../queue/product-sync.queue.js"

const TEST_TIMEOUT_MS = 15_000

async function withTimeout<T>(promise: Promise<T>, description: string): Promise<T> {
    let timeout: ReturnType<typeof setTimeout> | undefined
    try {
        return await Promise.race([
            promise,
            new Promise<never>((_, reject) => {
                timeout = setTimeout(
                    () => reject(new Error(`${description} timed out after ${TEST_TIMEOUT_MS}ms`)),
                    TEST_TIMEOUT_MS
                )
            })
        ])
    } finally {
        if (timeout) clearTimeout(timeout)
    }
}

const productWorker = new Worker(
    productSyncQueue.name,
    async (job) => ({
        success: true,
        processedProductId: job.data.commerceProductId
    }),
    { connection: redis }
)

const cmsWorker = new Worker(
    cmsSyncQueue.name,
    async (job) => ({
        success: true,
        processedCmsContentId: job.data.cmsContentId
    }),
    { connection: redis }
)

async function addAndWait(queue: typeof productSyncQueue, name: string, data: object) {
    const events = new QueueEvents(queue.name, { connection: redis.duplicate() })
    try {
        await withTimeout(events.waitUntilReady(), `${queue.name} QueueEvents ready`)
        const job = await withTimeout(queue.add(name, data, {
            jobId: `${name}-${Date.now()}`
        }), `${queue.name} job enqueue`)
        const result = await withTimeout(
            job.waitUntilFinished(events),
            `${queue.name} job completion`
        )

        return { job, result }
    } finally {
        await withTimeout(events.close(), `${queue.name} QueueEvents close`)
    }
}

async function testIdempotency() {
    const jobId = `duplicate-test-${Date.now()}`
    const first = await productSyncQueue.add(
        "sync-product",
        { commerceProductId: "prod_123" },
        { jobId }
    )
    const second = await productSyncQueue.add(
        "sync-product",
        { commerceProductId: "prod_123" },
        { jobId }
    )

    console.log("Idempotency job IDs:", first.id, second.id)
    if (first.id !== second.id) {
        throw new Error("Same jobId created different jobs")
    }
}

async function testRetry() {
    const queue = new Queue("retry-test", {
        connection: redis,
        defaultJobOptions: {
            removeOnFail: false
        }
    })
    const events = new QueueEvents(queue.name, { connection: redis.duplicate() })
    const worker = new Worker(
        queue.name,
        async () => {
            throw new Error("Testing retry mechanism")
        },
        { connection: redis }
    )

    try {
        await withTimeout(events.waitUntilReady(), "retry QueueEvents ready")
        worker.on("failed", (job, error) => {
            console.log(`Retry attempt failed: ${job?.attemptsMade}`, error.message)
        })

        await withTimeout(worker.waitUntilReady(), "retry Worker ready")
        await withTimeout(queue.drain(true), "retry queue drain")
        const job = await withTimeout(queue.add(
            "retry-test",
            { commerceProductId: "retry_test_123" },
            {
                jobId: `retry-${Date.now()}`,
                attempts: 3,
                backoff: { type: "exponential", delay: 1000 },
                removeOnFail: false
            }
        ), "retry job enqueue")

        try {
            await withTimeout(job.waitUntilFinished(events), "retry job completion")
            throw new Error("Retry job unexpectedly completed successfully")
        } catch (error) {
            if (error instanceof Error && error.message.includes("timed out"))
                throw error

            const failedJob = await withTimeout(queue.getJob(job.id!), "retry job lookup")
            console.log("Retry final state:", await failedJob?.getState())
            console.log("Retry attempts made:", failedJob?.attemptsMade)
            if (failedJob?.attemptsMade !== 3) {
                throw new Error(`Expected 3 attempts, got ${failedJob?.attemptsMade}`)
            }
        }
    } finally {
        await withTimeout(worker.close(), "retry Worker close")
        await withTimeout(events.close(), "retry QueueEvents close")
        await withTimeout(queue.close(), "retry queue close")
    }
}

async function main() {
    await withTimeout(productWorker.waitUntilReady(), "product Worker ready")
    await withTimeout(cmsWorker.waitUntilReady(), "CMS Worker ready")

    const product = await addAndWait(productSyncQueue, "sync-product", {
        commerceProductId: "prod_test_123"
    })
    console.log("Product Job State:", await product.job.getState())
    console.log("Product Job Result:", product.result)

    const cms = await addAndWait(cmsSyncQueue, "sync-cms-content", {
        cmsContentId: "cms_test_123",
        eventType: "items.update"
    })
    console.log("CMS Job State:", await cms.job.getState())
    console.log("CMS Job Result:", cms.result)

    await testIdempotency()
    await testRetry()
}

main()
    .catch((error) => {
        console.error("Queue test failed:", error)
        process.exitCode = 1
    })
    .finally(async () => {
        await withTimeout(productWorker.close(), "product Worker close")
        await withTimeout(cmsWorker.close(), "CMS Worker close")
        await withTimeout(productSyncQueue.close(), "product queue close")
        await withTimeout(cmsSyncQueue.close(), "CMS queue close")
        await withTimeout(redis.quit(), "Redis close")
    })
