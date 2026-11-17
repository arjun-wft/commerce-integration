import cron, { setRunCoordinator } from 'node-cron'
import { RedisLockCoordinator } from '@node-cron/redis-coordinator'
import redis from '../config/redis.js'
import { runIntialSync } from '../modules/sync/initial-sync.service.js'
import { db } from '../config/drizzle.js'
import { productSyncQueue } from '../queue/product-sync.queue.js'
import { cmsSyncQueue } from '../queue/cms-sync.queue.js'
import { webhookEvents } from '../database/schema.js'
import { asc, eq, inArray } from 'drizzle-orm'

const coordinator = new RedisLockCoordinator(redis, {
    clientType: 'ioredis'
})

setRunCoordinator(coordinator)       // distributed coordinator service

export async function scheduleIntitalSyncRunner() {
    try {
        await runIntialSync()
    }
    catch (error: any) {
        throw new Error(error?.message)
    }
}

export async function scheduleSyncWebhooks() {
    try {
        while (true) {
            const events = await db.transaction(async (tx) => {
                const failedEvents = await tx.select().from(webhookEvents).where(eq(webhookEvents.status, 'failed')).orderBy(asc(webhookEvents.receivedAt)).limit(100).for('update', { skipLocked: true })
                if (failedEvents.length === 0) {
                    return []
                }

                const ids = failedEvents.map((event) => {
                    return event.id
                })

                await tx.update(webhookEvents).set({
                    status: 'queue',
                }).where(inArray(webhookEvents.id, ids))

                return failedEvents
            })

            if(events.length == 0)
                break

            for (const event of events) {
                const queue = event.source == 'medusa' ? productSyncQueue : event.source == 'directus' ? cmsSyncQueue : undefined
                if (!queue)
                    throw new Error("Queue not found")

                await queue.add(queue.name, {
                    webhookEventId: event.id,
                    externalEventId: event.externalEventId,
                    eventType: event.eventType,
                    payload: event.payload
                }, { jobId: event.id })
            }
        }
    }
    catch (error: any) {
        console.log(`Error While Schedule of Sync Webhooks`)
        throw new Error(error?.message)
    }
}

const syncJobs = cron.schedule('*/15 * * * *', scheduleIntitalSyncRunner, {      // Har 15 minutes m sync kro
    name: "Schedule Inital Sync Runner",
    timezone: "Asia/Kolkata",
    distributed: true,
    noOverlap: true,
})

const syncWebhooks = cron.schedule("*/25 * * * *", scheduleSyncWebhooks, {    // Har 25 minutes m failed webhooks ko retry
    name: "Schedule Webhooks Failed Sync",
    timezone: 'Asia/Kolkata',
    distributed: true,
    noOverlap: true,
    maxRandomDelay: 10000,
})

// Graceful Shutdown of Workers
process.on('SIGINT' , async (singal)=>{
    await syncJobs.stop()
    await syncWebhooks.stop()
})