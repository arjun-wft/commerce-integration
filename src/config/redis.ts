import {Redis} from 'ioredis'
import envConfig from './env.js'

const redis = new Redis({
    host:envConfig.REDIS_HOST,
    port:Number(envConfig.REDIS_PORT),
    username:envConfig.REDIS_USERNAME,
    password:envConfig.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest:null,
    lazyConnect:true
})

async function test(){
    console.log(await redis.ping())
}

export default redis