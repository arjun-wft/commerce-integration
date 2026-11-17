import type { Request, Response, NextFunction } from "express";
import envConfig from "../../config/env.js";
import { timingSafeEqual } from "node:crypto";

export function verifyDirectusSignature(req: Request, res: Response, next: NextFunction) {

    console.log("Directus: " , req.body)

    const receivedSecret = req.headers['x-webhook-secret']
    const expectedWebhhokSecret = envConfig.DIRECTUS_WEBHOOK_SECRET

    if (typeof receivedSecret !== "string" || !receivedSecret || receivedSecret !== expectedWebhhokSecret) {
        return res.status(401).json({
            success: false,
            message: "Unauthorized"
        })
    }

    const receivedBuffer = Buffer.from(receivedSecret, 'utf-8')
    const expectedBuffer = Buffer.from(expectedWebhhokSecret, 'utf-8')

    if (receivedBuffer.length != expectedBuffer.length || !timingSafeEqual(expectedBuffer, receivedBuffer)) {
        return res.status(401).json({
            success: false,
            message: "Unauthorized"
        });
    }

    return next()
}