import { webhookEvents } from "../../database/schema.js"
import { db } from "../../config/drizzle.js"
import { and, eq } from "drizzle-orm"
import type { WebhookEventStatus, WebhookSource } from "./webhook.types.js"

export async function createWebhookEvent(data:typeof webhookEvents.$inferInsert){
    const [webhook] = await db.insert(webhookEvents).values(data).onConflictDoNothing({
        target:[
            webhookEvents.source , 
            webhookEvents.externalEventId
        ]
    }).returning()
    return webhook
}

export async function findWebhookByExternalId(source:WebhookSource , externalEventId:string){
    const [webhook] = await db.select().from(webhookEvents).where(and(eq(webhookEvents.externalEventId , externalEventId) , 
        eq(webhookEvents.source , source)
    ))
    return webhook ?? null
}

export async function updateWebhookEvent(id:string , status:WebhookEventStatus , errorMessage:string | null | undefined){
    const [webhook] = await db.update(webhookEvents).set({
        status:status,
        errorMessage:errorMessage ?? null,
        processedAt: status === 'completed' ? new Date() : null
    }).where(eq(webhookEvents.id , id)).returning()
    
    return webhook ?? null
}

export async function findWebhookById(id: string) {
    const [webhook] = await db
        .select()
        .from(webhookEvents)
        .where(eq(webhookEvents.id, id))

    return webhook ?? null
}