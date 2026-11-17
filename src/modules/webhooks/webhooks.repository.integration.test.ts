import { randomUUID } from "node:crypto"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { pool } from "../../config/database.js"
import {
    createWebhookEvent,
    findWebhookByExternalId,
    updateWebhookEvent
} from "./webhook.repository.js"

const createdWebhookEventIds: string[] = []

async function createTestWebhookEvent() {
    const suffix = randomUUID()
    const webhook = await createWebhookEvent({
        source: "directus",
        externalEventId: `integration-webhook-${suffix}`,
        eventType: "items.create",
        payload: { id: suffix }
    })
    if (webhook?.id) createdWebhookEventIds.push(webhook.id)
    return webhook
}

describe("webhooks repository integration", () => {
    beforeAll(async () => {
        await pool.query("SELECT 1")
    })

    afterAll(async () => {
        await pool.end()
    })

    afterEach(async () => {
        for (const id of createdWebhookEventIds.splice(0)) {
            await pool.query("DELETE FROM webhook_events WHERE id = $1", [id])
        }
    })

    it("creates a webhook event in PostgreSQL", async () => {
        const webhook = await createTestWebhookEvent()
        expect(webhook).toMatchObject({
            source: "directus",
            externalEventId: expect.stringMatching(/^integration-webhook-/),
            eventType: "items.create",
            payload: expect.any(Object)
        })
    })

    it("finds an existing webhook event", async () => {
        const created = await createTestWebhookEvent()
        await expect(
            findWebhookByExternalId("directus", created.externalEventId!)
        ).resolves.toEqual(created)
    })

    it("returns null for a non-existing webhook event", async () => {
        await expect(
            findWebhookByExternalId("directus", `missing-${randomUUID()}`)
        ).resolves.toBeNull()
    })

    it("ignores a duplicate event from the same source", async () => {
        const externalEventId = `integration-webhook-${randomUUID()}`
        const created = await createWebhookEvent({
            source: "directus",
            externalEventId,
            eventType: "items.create",
            payload: { duplicate: false }
        })
        expect(created).toBeDefined()
        createdWebhookEventIds.push(created!.id)

        const duplicate = await createWebhookEvent({
            source: "directus",
            externalEventId,
            eventType: "items.create",
            payload: { duplicate: true }
        })

        expect(duplicate).toBeUndefined()
    })

    it("allows the same event ID from different sources", async () => {
        const externalEventId = `integration-webhook-${randomUUID()}`
        const directusWebhook = await createWebhookEvent({
            source: "directus",
            externalEventId,
            eventType: "items.create",
            payload: { source: "directus" }
        })
        const medusaWebhook = await createWebhookEvent({
            source: "medusa",
            externalEventId,
            eventType: "product.created",
            payload: { source: "medusa" }
        })
        createdWebhookEventIds.push(directusWebhook.id, medusaWebhook.id)

        expect(directusWebhook.externalEventId).toBe(externalEventId)
        expect(medusaWebhook.externalEventId).toBe(externalEventId)
        await expect(findWebhookByExternalId("directus", externalEventId)).resolves.toEqual(directusWebhook)
        await expect(findWebhookByExternalId("medusa", externalEventId)).resolves.toEqual(medusaWebhook)
    })

    it("sets processedAt when completed and saves an error when failed", async () => {
        const webhook = await createTestWebhookEvent()

        const completed = await updateWebhookEvent(webhook.id, "completed", null)
        expect(completed).not.toBeNull()
        expect(completed?.status).toBe("completed")
        expect(completed?.processedAt).toBeInstanceOf(Date)

        const failed = await updateWebhookEvent(webhook.id, "failed", "Webhook processing failed")
        expect(failed).not.toBeNull()
        expect(failed?.status).toBe("failed")
        expect(failed?.errorMessage).toBe("Webhook processing failed")
        expect(failed?.processedAt).toBeNull()
    })
})
