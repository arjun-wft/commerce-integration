import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { pool } from "../../config/database.js"
import redis from "../../config/redis.js"
import { cmsSyncQueue } from "../../queue/cms-sync.queue.js"
import { productSyncQueue } from "../../queue/product-sync.queue.js"
import { receiveWebhook } from "./webhook.service.js"
import type { WebhookEvent } from "./webhook.types.js"

interface TestWebhookInput {
    source: "medusa" | "directus"
    externalEventId: string
    eventType: string
    payload: { id: string }
}

const testWebhookInputs: TestWebhookInput[] = []

async function webhookInput(source: "medusa" | "directus", externalEventId: string): Promise<TestWebhookInput> {
    const input = {
        source,
        externalEventId,
        eventType: source === "medusa" ? "product.created" : "items.create",
        payload: { id: externalEventId }
    }
    testWebhookInputs.push(input)
    return input
}

function requireWebhookEvent(event: WebhookEvent | null | undefined): WebhookEvent {
    if (!event)
        throw new Error("Expected webhook event to be persisted")
    return event
}

function queueForSource(source: "medusa" | "directus") {
    return source === "medusa" ? productSyncQueue : cmsSyncQueue
}

async function findQueueJobs(queue: typeof productSyncQueue | typeof cmsSyncQueue, externalEventId: string) {
    const jobs = await queue.getJobs(
        ["waiting", "active", "delayed", "completed", "failed", "waiting-children"],
        0,
        1000
    )
    return jobs.filter((job) =>
        job.data.externalEventId === externalEventId
        || job.data.webhookEventId === externalEventId
    )
}

async function expectExactlyOneQueueJob(
    source: "medusa" | "directus",
    externalEventId: string,
    webhookEventId: string
) {
    const expectedQueue = queueForSource(source)
    const otherQueue = queueForSource(source === "medusa" ? "directus" : "medusa")
    const jobs = await findQueueJobs(expectedQueue, externalEventId)

    expect(jobs).toHaveLength(1)
    expect(jobs[0]?.id).toBe(webhookEventId)
    expect(await findQueueJobs(otherQueue, externalEventId)).toHaveLength(0)
}

describe("webhooks service integration", () => {
    beforeAll(async () => {
        await pool.query("SELECT 1")
        await Promise.all([
            productSyncQueue.waitUntilReady(),
            cmsSyncQueue.waitUntilReady()
        ])
    })

    afterEach(async () => {
        for (const input of testWebhookInputs) {
            const queue = queueForSource(input.source)
            for (const job of await findQueueJobs(queue, input.externalEventId)) {
                await job.remove()
            }
            await pool.query(
                "DELETE FROM webhook_events WHERE source = $1 AND external_event_id = $2",
                [input.source, input.externalEventId]
            )
        }
        testWebhookInputs.length = 0
        vi.restoreAllMocks()
    })

    afterAll(async () => {
        await productSyncQueue.close()
        await cmsSyncQueue.close()
        await redis.quit()
        await pool.end()
    })

    it("persists a new Medusa event and enqueues it on productSyncQueue", async () => {
        const input = await webhookInput("medusa", `integration-webhook-${randomUUID()}`)
        const result = await receiveWebhook(input)
        const event = requireWebhookEvent(result.event)

        expect(result.duplicate).toBe(false)
        const rows = await pool.query(
            "SELECT id, status FROM webhook_events WHERE source = $1 AND external_event_id = $2",
            [input.source, input.externalEventId]
        )
        expect(rows.rowCount).toBe(1)
        expect(rows.rows[0].id).toBe(event.id)
        expect(rows.rows[0].status).toBe("queued")
        await expectExactlyOneQueueJob("medusa", input.externalEventId, event.id)
    })

    it("persists a new Directus event and enqueues it on cmsSyncQueue", async () => {
        const input = await webhookInput("directus", `integration-webhook-${randomUUID()}`)
        const result = await receiveWebhook(input)
        const event = requireWebhookEvent(result.event)

        expect(result.duplicate).toBe(false)
        const rows = await pool.query(
            "SELECT id, status FROM webhook_events WHERE source = $1 AND external_event_id = $2",
            [input.source, input.externalEventId]
        )
        expect(rows.rowCount).toBe(1)
        expect(rows.rows[0].id).toBe(event.id)
        expect(rows.rows[0].status).toBe("queued")
        await expectExactlyOneQueueJob("directus", input.externalEventId, event.id)
    })

    it("does not enqueue a second job for a duplicate webhook", async () => {
        const input = await webhookInput("medusa", `integration-webhook-${randomUUID()}`)
        const first = await receiveWebhook(input)
        const second = await receiveWebhook(input)
        const firstEvent = requireWebhookEvent(first.event)
        const secondEvent = requireWebhookEvent(second.event)

        expect(first.duplicate).toBe(false)
        expect(second.duplicate).toBe(true)
        expect(secondEvent.id).toBe(firstEvent.id)
        const rows = await pool.query(
            "SELECT id FROM webhook_events WHERE source = $1 AND external_event_id = $2",
            [input.source, input.externalEventId]
        )
        expect(rows.rowCount).toBe(1)
        await expectExactlyOneQueueJob("medusa", input.externalEventId, firstEvent.id)
    })

    it("accepts the same event ID from Directus", async () => {
        const externalEventId = `integration-webhook-${randomUUID()}`
        const medusa = await receiveWebhook(await webhookInput("medusa", externalEventId))
        const directus = await receiveWebhook(await webhookInput("directus", externalEventId))
        const medusaEvent = requireWebhookEvent(medusa.event)
        const directusEvent = requireWebhookEvent(directus.event)
        expect(medusa.duplicate).toBe(false)
        expect(directus.duplicate).toBe(false)
        const medusaJobs = await findQueueJobs(productSyncQueue, externalEventId)
        const directusJobs = await findQueueJobs(cmsSyncQueue, externalEventId)

        expect(medusaJobs).toHaveLength(1)
        expect(directusJobs).toHaveLength(1)

        expect(medusaJobs[0]?.id).toBe(medusaEvent.id)
        expect(directusJobs[0]?.id).toBe(directusEvent.id)
        expect(medusaEvent.id).not.toBe(directusEvent.id)
    })

    it("rejects an empty source", async () => {
        const input = await webhookInput("medusa", `integration-webhook-${randomUUID()}`)
        await expect(
            receiveWebhook({ ...input, source: "" })
        ).rejects.toThrow("Event Source is required")
    })

    it("rejects an empty event ID", async () => {
        const input = await webhookInput("medusa", "")
        await expect(receiveWebhook(input)).rejects.toThrow("External Id is required")
    })

    it("rejects an empty event type", async () => {
        const input = await webhookInput("medusa", `integration-webhook-${randomUUID()}`)
        await expect(receiveWebhook({ ...input, eventType: "" })).rejects.toThrow("Event type is required")
    })

    it("stores only one row when the same event arrives concurrently", async () => {
        const input = await webhookInput("medusa", `integration-webhook-${randomUUID()}`)
        const results = await Promise.all([
            receiveWebhook(input),
            receiveWebhook(input)
        ])

        expect(results.map((result) => result.duplicate).sort()).toEqual([false, true])

        const rows = await pool.query(
            "SELECT COUNT(*)::int AS count FROM webhook_events WHERE source = $1 AND external_event_id = $2",
            [input.source, input.externalEventId]
        )
        expect(rows.rows[0].count).toBe(1)
        const createdEvent = results.find((result) => !result.duplicate)
        expect(createdEvent).toBeDefined()
        await expectExactlyOneQueueJob(
            "medusa",
            input.externalEventId,
            requireWebhookEvent(createdEvent?.event).id
        )
    })

    it("keeps a persisted event recoverable when queue enqueue fails", async () => {
        const input = await webhookInput("medusa", `integration-webhook-${randomUUID()}`)
        vi.spyOn(productSyncQueue, "add").mockRejectedValue(new Error("Simulated Redis enqueue failure"))

        const outcome = await receiveWebhook(input).then(
            () => ({ rejected: false }),
            () => ({ rejected: true })
        )

        const rows = await pool.query(
            "SELECT id, status FROM webhook_events WHERE source = $1 AND external_event_id = $2",
            [input.source, input.externalEventId]
        )
        expect(rows.rowCount).toBe(1)
        expect(rows.rows[0].status).not.toBe("queued")
        expect(await findQueueJobs(productSyncQueue, input.externalEventId)).toHaveLength(0)
        expect(outcome.rejected).toBe(true)
    })


    it("recovers and enqueues a persisted event when the same webhook is retried", async () => {
        const input = await webhookInput(
            "medusa",
            `integration-webhook-${randomUUID()}`
        )

        vi.spyOn(productSyncQueue, "add").mockRejectedValueOnce(
            new Error("Simulated Redis enqueue failure")
        )

        // First attempt: enqueue fails
        await expect(receiveWebhook(input)).rejects.toThrow(
            "Simulated Redis enqueue failure"
        )

        const firstRows = await pool.query(
            `SELECT id, status FROM webhook_events
         WHERE source = $1 AND external_event_id = $2`,
            [input.source, input.externalEventId]
        )

        expect(firstRows.rowCount).toBe(1)
        expect(firstRows.rows[0].status).toBe("received")

        // Second attempt: same webhook should recover
        const retryResult = await receiveWebhook(input)
        const recoveredEvent = requireWebhookEvent(retryResult.event)

        expect(retryResult.duplicate).toBe(true)
        expect(recoveredEvent.id).toBe(firstRows.rows[0].id)

        // Verify database status
        const finalRows = await pool.query(
            `SELECT id, status FROM webhook_events
         WHERE source = $1 AND external_event_id = $2`,
            [input.source, input.externalEventId]
        )

        expect(finalRows.rowCount).toBe(1)
        expect(finalRows.rows[0].status).toBe("queued")

        // Verify exactly one BullMQ job exists
        await expectExactlyOneQueueJob(
            "medusa",
            input.externalEventId,
            recoveredEvent.id
        )
    })

})
