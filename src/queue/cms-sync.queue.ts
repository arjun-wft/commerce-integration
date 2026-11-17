import { Queue } from "bullmq"
import redis from "../config/redis.js"

export const cmsSyncQueue = new Queue('cms-sync' , {
    connection:redis,
    defaultJobOptions:{
        attempts:3,
        backoff:{
            delay:1000,
            type:'exponential',
            jitter:1
        },
        removeOnComplete:100,
        removeOnFail:false,
    }
})