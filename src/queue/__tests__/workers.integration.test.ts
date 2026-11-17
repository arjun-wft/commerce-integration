import { randomUUID } from "node:crypto"
import { Queue, QueueEvents, Worker } from "bullmq"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { pool } from "../../config/database.js"
import redis from "../../config/redis.js"
import { cmsSyncQueue } from "../cms-sync.queue.js"
import { productSyncQueue } from "../product-sync.queue.js"
import { cmsSyncWorker } from "../../workers/cms-sync.worker.js"
import { productSyncWorker } from "../../workers/product-sync.worker.js"
import {
    createWebhook,
    receiveWebhook,
    updateWebhook
} from "../../modules/webhooks/webhook.service.js"

const TEST_TIMEOUT_MS = 15_000

const createdWebhooks: Array<{
    id: string
    queue: typeof productSyncQueue | typeof cmsSyncQueue
}> = []

async function expectActualWorkerCompletion(
    source: "medusa" | "directus",
    eventType: string
) {
    const externalEventId = `worker-integration-${randomUUID()}`
    const queue = source === "medusa" ? productSyncQueue : cmsSyncQueue
    const events = new QueueEvents(queue.name, { connection: redis.duplicate() })

    try {
        await events.waitUntilReady()
        const received = await receiveWebhook({
            source,
            externalEventId,
            eventType,
            payload: { id: externalEventId }
        })

        if (!received.event)
            throw new Error("Expected webhook event to be persisted")

        createdWebhooks.push({ id: received.event.id, queue })
        const job = await queue.getJob(received.event.id)
        if (!job)
            throw new Error("Expected webhook job to be enqueued")

        const result = await job.waitUntilFinished(events, TEST_TIMEOUT_MS)
        expect(result.success).toBe(true)

        const rows = await pool.query(
            "SELECT status, processed_at FROM webhook_events WHERE id = $1",
            [received.event.id]
        )
        expect(rows.rowCount).toBe(1)
        expect.soft(rows.rows[0].status).toBe("completed")
        expect.soft(rows.rows[0].processed_at).toBeInstanceOf(Date)
    } finally {
        await events.close()
    }
}

async function expectActualWorkerFailureHandling(
    source: "medusa" | "directus",
    eventType: string,
    worker: Worker,
    queue: typeof productSyncQueue | typeof cmsSyncQueue
) {
    const externalEventId = `worker-failure-integration-${randomUUID()}`
    const errorMessage = `intentional ${source} worker failure`
    let webhookId: string | undefined

    try {
        const event = await createWebhook({
            source,
            externalEventId,
            eventType,
            payload: { id: externalEventId }
        })

        if (!event)
            throw new Error("Expected webhook event to be persisted")

        webhookId = event.id
        createdWebhooks.push({ id: event.id, queue })
        await queue.add(queue.name, {
            webhookEventId: event.id,
            externalEventId,
            eventType,
            payload: { id: externalEventId }
        }, {
            jobId: event.id,
            delay: 60_000,
            attempts: 3
        })
        await updateWebhook(event.id, { status: "queued" })

        const job = await queue.getJob(event.id)
        if (!job)
            throw new Error("Expected webhook job to be enqueued")

        expect(job.opts.attempts).toBe(3)
        const error = new Error(errorMessage)

        job.attemptsMade = 2
        worker.emit("failed", job, error, "active")
        await new Promise((resolve) => setTimeout(resolve, 100))

        const beforeFinalAttempt = await pool.query(
            "SELECT status, error_message, processed_at FROM webhook_events WHERE id = $1",
            [event.id]
        )
        expect(beforeFinalAttempt.rows[0]).toMatchObject({
            status: "queued",
            error_message: null,
            processed_at: null
        })

        job.attemptsMade = 3
        worker.emit("failed", job, error, "active")

        const deadline = Date.now() + TEST_TIMEOUT_MS
        let finalRows = await pool.query(
            "SELECT status, error_message, processed_at FROM webhook_events WHERE id = $1",
            [event.id]
        )
        while (finalRows.rows[0]?.status !== "failed" && Date.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, 25))
            finalRows = await pool.query(
                "SELECT status, error_message, processed_at FROM webhook_events WHERE id = $1",
                [event.id]
            )
        }

        expect(finalRows.rows[0]).toMatchObject({
            status: "failed",
            error_message: errorMessage,
            processed_at: null
        })
    } finally {
        if (webhookId) {
            const job = await queue.getJob(webhookId)
            if (job)
                await job.remove()
        }
    }
}

describe("webhook worker integration", () => {
    beforeAll(async () => {
        await pool.query("SELECT 1")
        await Promise.all([
            productSyncQueue.waitUntilReady(),
            cmsSyncQueue.waitUntilReady(),
            productSyncWorker.waitUntilReady(),
            cmsSyncWorker.waitUntilReady()
        ])
    })

    afterEach(async () => {
        for (const webhook of createdWebhooks.splice(0)) {
            const job = await webhook.queue.getJob(webhook.id)
            if (job)
                await job.remove()

            await pool.query("DELETE FROM webhook_events WHERE id = $1", [webhook.id])
        }
    })

    afterAll(async () => {
        await productSyncWorker.close()
        await cmsSyncWorker.close()
        await productSyncQueue.close()
        await cmsSyncQueue.close()
        await redis.quit()
        await pool.end()
    })

    it("completes a webhook through the product-sync worker", async () => {
        await expectActualWorkerCompletion("medusa", "product.created")
    }, TEST_TIMEOUT_MS)

    it("completes a webhook through the CMS worker", async () => {
        await expectActualWorkerCompletion("directus", "items.create")
    }, TEST_TIMEOUT_MS)

    it("updates product webhook failure status only after the final attempt", async () => {
        await expectActualWorkerFailureHandling(
            "medusa",
            "product.created",
            productSyncWorker,
            productSyncQueue
        )
    }, TEST_TIMEOUT_MS)

    it("updates CMS webhook failure status only after the final attempt", async () => {
        await expectActualWorkerFailureHandling(
            "directus",
            "items.create",
            cmsSyncWorker,
            cmsSyncQueue
        )
    }, TEST_TIMEOUT_MS)

    it("marks a separate test queue job failed after its configured retries", async () => {
        const queueName = `worker-retry-${randomUUID()}`
        const queueConnection = redis.duplicate()
        const workerConnection = redis.duplicate()
        const eventsConnection = redis.duplicate()
        const queue = new Queue(queueName, {
            connection: queueConnection,
            defaultJobOptions: {
                attempts: 3,
                backoff: { type: "fixed", delay: 10 },
                removeOnFail: false
            }
        })
        const events = new QueueEvents(queueName, { connection: eventsConnection })
        const worker = new Worker(
            queueName,
            async () => {
                throw new Error("intentional test processor failure")
            },
            { connection: workerConnection }
        )

        try {
            await Promise.all([
                queue.waitUntilReady(),
                events.waitUntilReady(),
                worker.waitUntilReady()
            ])

            const job = await queue.add("retry-failure", { id: randomUUID() })
            await expect(job.waitUntilFinished(events, TEST_TIMEOUT_MS))
                .rejects.toThrow("intentional test processor failure")

            const failedJob = await queue.getJob(job.id!)
            expect(failedJob).toBeDefined()
            expect(failedJob?.opts.attempts).toBe(3)
            expect(failedJob?.attemptsMade).toBe(3)
            expect(failedJob?.failedReason).toBe("intentional test processor failure")
            await expect(failedJob?.getState()).resolves.toBe("failed")
        } finally {
            await worker.close()
            await events.close()
            await queue.obliterate({ force: true })
            await queue.close()
            await Promise.all([
                workerConnection.quit(),
                eventsConnection.quit(),
                queueConnection.quit()
            ])
        }
    }, TEST_TIMEOUT_MS)
})
