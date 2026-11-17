import type { SubscriberConfig , SubscriberArgs } from "@medusajs/framework"
import crypto from 'crypto'

export default async function productSyncHanlder({event,}:SubscriberArgs<{id:string}>){
    
    const secret = process.env.MEDUSA_WEBHOOK_SECRET
    if(!secret)
        throw new Error("Medusa Webhook Secret is Not Provided")
    const webhookUrl = process.env.COMMERCE_INTEGRATION_WEBHOOK_URL
        || 'http://localhost:3000/webhooks/medusa'

    const payload = {
        eventId:crypto.randomUUID(),
        data:event.data,
        eventType:event.name
    }

    const rawBody = JSON.stringify(payload)
    const timestamp = Math.floor(Date.now() / 1000).toString()

    const signature = crypto.createHmac('sha256' , secret).update(`${timestamp}.${rawBody}`).digest('hex')
    const response = await fetch(webhookUrl, {
        method:"POST",
        headers:{
            'Content-Type':"application/json",
            'x-medusa-timestamp':timestamp,
            'x-medusa-signature':signature
        },
        body:rawBody
    })

    if (!response.ok) {
        throw new Error(
            `Middleware webhook failed: ${response.status} ${await response.text()}`
        )
    }

    console.log("Middleware accepted event:", event.name)
}

export const config:SubscriberConfig = {
    event:[
        "product.created",
        "product.updated",
        "product.deleted",
        "product-variant.created",
        "product-variant.deleted",
        "product-variant.updated"
    ]
}