import { createWebhookEvent, updateWebhookEvent, findWebhookByExternalId } from "./webhook.repository.js"
import type { CreateWebhookEventInput, UpdateWebhookEventInput, WebhookSource } from "./webhook.types.js"
import { productSyncQueue } from "../../queue/product-sync.queue.js"
import { cmsSyncQueue } from "../../queue/cms-sync.queue.js"

export async function enqueueWebhookEvent(event: NonNullable<Awaited<ReturnType<typeof createWebhookEvent>>>,
    data: CreateWebhookEventInput) {

    const queue = data.source == 'medusa' ? productSyncQueue : cmsSyncQueue
    if (!queue)
        throw new Error("Invalid Webhook Source")

    const updatedEvent = await updateWebhook(event.id, {
        status: 'queued'
    });

    if (!updatedEvent)
        throw new Error("Failed to update webhook status");

    const jobsData = {
        webhookEventId: event.id,
        externalEventId: data.externalEventId,
        eventType: data.eventType,
        payload: data.payload
    }

    await queue.add(queue.name, jobsData, { jobId: event.id })

    return updatedEvent
}

export async function getWebhookByExternalId(source: WebhookSource, externalEventId: string) {
    if (typeof source !== "string" || !source.trim())
        throw new Error("Soruce is Required")

    if (typeof externalEventId !== "string" || !externalEventId.trim())
        throw new Error("External Id is required")

    return findWebhookByExternalId(source, externalEventId)
}

export async function createWebhook(data: CreateWebhookEventInput) {
    if (!data.externalEventId?.trim())
        throw new Error("External Id is required")

    if (!data.eventType.trim())
        throw new Error("Event type is required")

    if (!data.source.trim())
        throw new Error("Event Source is required")

    return createWebhookEvent(data)
}

export async function updateWebhook(id: string, updateEvent: UpdateWebhookEventInput) {
    if (!id.trim())
        throw new Error("ID is required")

    if (!updateEvent.status)
        throw new Error("No Status is Provided")

    return updateWebhookEvent(id, updateEvent.status, updateEvent.errorMessage)
}

export async function receiveWebhook(data: CreateWebhookEventInput) {
    const event = await createWebhook(data)
    console.log(`Webook inserted: ${event}`)

    if (!event) {
        const existingEvent = await getWebhookByExternalId(data.source, data.externalEventId)

        // Extsiting event not found as well as duplicate webhook
        if (!existingEvent) {
            throw new Error("Duplicate Event Find But This Event Webhook is Already Deleted or Erased By SomeOne Else")
        }

        if (existingEvent.status == 'received') {
            const recoveredEvent = await enqueueWebhookEvent(
                existingEvent,
                data
            )


            return {
                duplicate: true,
                event: recoveredEvent
            }
        }
        return {
            duplicate: true,
            event: existingEvent
        }

    }

    // Update on Respected Queue
    const updatedEvent = await enqueueWebhookEvent(event, data)

    return {
        duplicate: false,
        event: updatedEvent
    }
}