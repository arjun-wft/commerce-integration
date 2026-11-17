import express from 'express'
import type { Request } from "express"
import router from './modules/webhooks/webhook.route.js'
import env from './config/env.js'
import { productSyncWorker } from './workers/product-sync.worker.js'
import { cmsSyncWorker } from './workers/cms-sync.worker.js'
import searchDbRouter from './modules/search/router.js'
import { resolve } from 'node:path'

const app = express()
const frontendDirectory = resolve(process.cwd(), 'frontend')

app.get('/' , (req,res)=>{
    res.sendFile(resolve(frontendDirectory, 'index.html'))
})
app.use(express.static(frontendDirectory))

app.use(express.json({
    verify:(req,res,buf)=>{
        (req as Request & {rawBody?:Buffer}).rawBody = Buffer.from(buf)
    }
}))

app.use('/webhooks' , router)
app.use('/api' , searchDbRouter)

app.listen(env.PORT || 3000 , ()=>{
    if(productSyncWorker.isRunning()){
        console.log("Product Sync Worker is Running")
    }

    if(cmsSyncWorker.isRunning()){
        console.log("CMS Worker is Running")
    }
    console.log("Server is Running on Port " , env.PORT || 3000)
})