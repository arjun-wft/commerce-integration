import type { Request , Response , NextFunction } from "express"
import crypto from 'crypto'
import env from "../../config/env.js"

// [HMAC = SHA256(Secret,\ Timestamp + "." + RawBody)]
export async function verifyMedusaSignature(req:Request , res:Response , next:NextFunction){

    console.log('Medusa Sign Veirfying')
    console.log(req.body)

    const timeStamp = req.headers['x-medusa-timestamp']
    const receivedSignature = req.headers['x-medusa-signature']

    const secret = env.MEDUSA_WEBHOOK_SECRET
    const rawBody = (req as Request & {rawBody?:Buffer}).rawBody

    if(!timeStamp || typeof timeStamp !== 'string' || !secret || !rawBody || typeof receivedSignature !== 'string'){
         return res.status(401).json({
            success: false,
            message: "Unauthorized"
        })
    }

    // 5 Minute purana reject kro 
    const timestampNumber = Number(timeStamp)
    if(!Number.isSafeInteger(timestampNumber) || Math.abs(Date.now() /  1000 - timestampNumber) > 300){
        return res.status(401).json({
            success: false,
            message: "Expired or invalid timestamp"
        })
    }

    // 0-9 A-F 64 character for medusa secret
    if(!/^[a-f0-9]{64}$/i.test(receivedSignature)){
        return res.status(401).json({
            success: false,
            message: "Invalid signature"
        })
    }

    const expectedSignature = crypto.createHmac('sha256' , secret).update(timeStamp).update('.').update(rawBody).digest()
    const receivedBuffer = Buffer.from(receivedSignature , 'hex')

    if (!crypto.timingSafeEqual(expectedSignature, receivedBuffer)) {
        return res.status(401).json({
            success: false,
            message: "Invalid signature"
        })
    }

    console.log(`Medusa Sign Veirfied Yes`)
    next()
}