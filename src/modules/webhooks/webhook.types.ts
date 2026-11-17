import { webhookEvents } from "../../database/schema.js"
import type { InferSelectModel, InferInsertModel } from "drizzle-orm"

export type WebhookEvent = InferSelectModel<typeof webhookEvents>

export interface CreateWebhookEventInput {
    source: WebhookSource
    externalEventId: string
    eventType: string
    payload: any
}

export type WebhookEventStatus =
  | "received"
  | "queued"
  | "processing"
  | "completed"
  | "failed"

export type WebhookSource = "medusa" | "directus"

export interface UpdateWebhookEventInput {
  status: WebhookEventStatus
  errorMessage?: string | null
}