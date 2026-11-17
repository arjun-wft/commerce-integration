import { db } from "../../config/drizzle.js";
import type { Request, Response } from "express";
import { mergedProducts, mergedVariants, webhookEvents } from "../../database/schema.js";
import { and, desc, eq } from "drizzle-orm";
import { runIntialSync } from "../sync/initial-sync.service.js";

export async function getAllProducts(req: Request, res: Response) {
    try {
        const limitParam = Number(req.query.limit)
        const offsetParam = Number(req.query.offset)

        if (!limitParam && !offsetParam) {
            const products = await db.select().from(mergedProducts)
            return {
                status: true,
                products,
                count: products.length
            }
        }
        else if (limitParam <= 0 || offsetParam < 0) {
            return res.status(400).json({
                status: false,
                message: "Invalid Limit or Offset"
            })
        }
        else if (limitParam && !offsetParam) {
            const products = await db.select().from(mergedProducts).limit(limitParam)
            return res.status(200).json({
                status: true,
                products,
                count: products.length
            })
        }
        else {
            const products = await db.select().from(mergedProducts).limit(limitParam).offset(offsetParam)
            return res.status(200).json({
                status: true,
                products,
                count: products.length
            })
        }
    }
    catch (error: any) {
        console.error("Error fetching products:", error)

        return res.status(500).json({
            success: false,
            message: "Failed to fetch products"
        })
    }
}

export async function getOneProduct(req: Request, res: Response) {
    const productId = req.params.productId as string
    if (!productId) {
        return res.status(400).json({
            status: false,
            message: "Product ID is Not Provided"
        })
    }

    try {
        const [product] = await db.select().from(mergedProducts).where(eq(mergedProducts.id, productId))
        return res.status(200).json({
            status: true,
            product
        })
    }
    catch (error: any) {
        return res.status(501).json({
            status: false,
            message: "Internal Server Error " + error?.message
        })
    }
}

export async function getAllVariantsOfProduct(req: Request, res: Response) {
    const limitParam = Number(req.query.limit)
    const offsetParam = Number(req.query.offset)

    const productId = req.params.productId
    if (!productId || typeof productId !== 'string') {
        return res.status(400).json({
            status: false,
            message: "Product ID is Required"
        })
    }

    try {
        if (!limitParam && !offsetParam) {
            const variants = await db.select().from(mergedVariants).where(eq(mergedVariants.productId, productId))
            return res.status(200).json({
                status: true,
                variants,
                count: variants.length
            })
        }
        else if (limitParam && !offsetParam) {
            const variants = await db.select().from(mergedVariants).where(eq(mergedVariants.productId, productId)).limit(limitParam)
            return res.status(200).json({
                status: true,
                count: variants.length,
                variants
            })
        }
        else if (limitParam <= 0 || offsetParam < 0) {
            return res.status(400).json({
                status: false,
                message: "Invalid Limit or Offset Param"
            })
        }
        else {
            const variants = await db.select().from(mergedVariants).limit(limitParam).offset(offsetParam)
            return res.status(200).json({
                status: true,
                count: variants.length,
                variants
            })
        }
    }
    catch (error: any) {
        return res.status(501).json({
            status: false,
            message: "Internal Server Error " + error?.message
        })
    }
}

export async function getAllVariants(req: Request, res: Response) {
    try {
        const variants = await db.select().from(mergedVariants)
        return res.status(200).json({
            status: true,
            variants,
            count: variants.length
        })
    }
    catch (error: any) {
        return res.status(501).json({
            status: false,
            message: "Internal Server Error " + error?.message
        })
    }
}

export async function getAllWebhooks(req: Request, res: Response) {
    const limitParam = Number(req.query.limit)
    const offsetParam = Number(req.query.offset)

    try {
        if (!limitParam && !offsetParam) {
            const webhooks = await db.select().from(webhookEvents)
            return res.status(200).json({
                status: true,
                webhooks,
                count: webhooks.length
            })
        }
        else if (limitParam <= 0 || offsetParam < 0) {
            return res.status(400).json({
                status: false,
                message: "Invalid Limit or Offset Param"
            })
        }
        else if (limitParam && !offsetParam) {
            const webhooks = await db.select().from(webhookEvents).limit(limitParam).orderBy(desc(webhookEvents.processedAt))
            return res.status(200).json({
                status: true,
                webhooks,
                count: webhooks.length
            })
        }
        else {
            const webhooks = await db.select().from(webhookEvents).limit(limitParam).offset(offsetParam).orderBy(desc(webhookEvents.processedAt))
            return res.status(200).json({
                status: true,
                webhooks,
                count: webhooks.length
            })
        }
    }
    catch (error: any) {
        return res.status(501).json({
            status: false,
            message: "Internal Server Error " + error?.message
        })
    }
}

export async function getVariant(req: Request, res: Response) {
    try {
        const variantId = req.params.variantId as string
        const productId = req.params.productId as string

        if (!variantId || !productId) {
            return res.status(401).json({
                status: false,
                message: "Variant ID and Product Id is Required"
            })
        }

        const [variant] = await db.select().from(mergedVariants).where(and(eq(mergedVariants.productId, productId), eq(mergedVariants.id, variantId)))
        return res.status(200).json({
            status: true,
            variant
        })
    }
    catch (error: any) {
        return res.status(501).json({
            status: false,
            message: "Internal Server Error " + error?.message
        })
    }
}

export async function runSync(req: Request, res: Response) {
    try {
        const response = await runIntialSync()
        return res.status(200).json({
            response,
            status:true
        })
    }
    catch (error: any) {
        return res.status(501).json({
            status: false,
            message: "Internal Server Error " + error?.message
        })
    }
}