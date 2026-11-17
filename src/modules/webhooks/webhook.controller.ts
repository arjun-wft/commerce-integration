import type { Request, Response } from "express"
import { receiveWebhook } from "./webhook.service.js"
import { createHash } from "node:crypto"

export async function handleMedusaWebhook(req: Request, res: Response) {
    try {
        const { eventId, eventType, data } = req.body
        const result = await receiveWebhook({
            source: "medusa",
            externalEventId: eventId,
            eventType,
            payload: data
        })

        if (result.duplicate) {
            return res.status(200).json({
                success: true,
                message: "Duplicate event",
                duplicate: true
            })
        }

        return res.status(202).json({
            success: true,
            message: "Webhook accepted",
            duplicate: false
        })
    }
    catch (error: any) {
        res.status(500).json({
            success: false,
            message: "Webhook processing failed"
        })
    }
}


export async function handleDirectusWehook(req: Request, res: Response) {

    /**
     * Keys array isliye h kyuki directus bulk update allow krta h lekin bulk update m sabki fields ke same value hogi ye gurrante h ek ka alg ek 
     * ka alg allow nhi h 
     * 
     * 
     * Directus:  {
            event: 'product_contents.items.update',
            payload: { seo_title: 'Wireless Bluetooth HeadPhone' },
            keys: [ '0154a88a-c831-4f93-8a11-bc50aad3e2ff' ],
            collection: 'product_contents'
    }
     */

    try {
        const { event, payload, keys, collection, key } = req.body
        const itemKeys = keys ?? (key ? [key] : [])

        if (!event || !collection || itemKeys.length === 0) {
            return res.status(400).json({
                success: false,
                message: "Invalid Directus webhook payload"
            })
        }

        const externalEventId = createHash('sha256').update(JSON.stringify({
            event,
            collection,
            keys: itemKeys,
            payload
        })).digest('hex')

        const result = await receiveWebhook({
            source: "directus",
            externalEventId,
            eventType: event,
            payload: {
                collection,
                keys: itemKeys,
                data: payload
            }
        })

        if (result.duplicate) {
            return res.status(200).json({
                success: true,
                message: "Duplicate event",
                duplicate: true
            })
        }

        return res.status(202).json({
            success: true,
            message: "Webhook accepted",
            duplicate: false
        })
    }
    catch (error: any) {
        res.status(500).json({
            success: false,
            message: "Webhook processing failed"
        })
    }
}