import envConfig from "./env.js"

export interface MedusaPrice {
    id: string
    amount: number
    currency_code: string
    min_quantity?: number | null
    max_quantity?: number | null
}

export interface MedusaProductOptionValue {
    id: string
    value: string
    option_id: string
}

export interface MedusaProductVariant {
    id: string
    title: string
    product_id: string
    sku: string | null
    manage_inventory: boolean
    allow_backorder: boolean
    inventory_quantity?: number
    options: MedusaProductOptionValue[]
    prices: MedusaPrice[]
}

export interface MedusaProduct {
    id: string
    title: string
    handle: string | null
    description: string | null
    variants: MedusaProductVariant[]
}

export interface MedusaProductPage {
    products: MedusaProduct[]
    count: number
    limit: number
    offset: number
}

interface MedusaVariantPage {
    variants: MedusaProductVariant[]
    count: number
    limit: number
    offset: number
}

function getMedusaConfig() {
    const baseUrl = envConfig.MEDUSA_BASE_URL?.trim()
    const secretKey = envConfig.MEDUSA_SECRET_KEY?.trim()

    if (!baseUrl)
        throw new Error("MEDUSA_BASE_URL is required to call the Medusa Admin API")
    if (!secretKey)
        throw new Error("MEDUSA_SECRET_KEY is required to call the Medusa Admin API")

    let url: URL
    try {
        url = new URL(baseUrl)
    } catch {
        throw new Error("MEDUSA_BASE_URL must be a valid absolute URL")
    }

    if (url.protocol !== "http:" && url.protocol !== "https:")
        throw new Error("MEDUSA_BASE_URL must use HTTP or HTTPS")

    return { baseUrl: baseUrl.replace(/\/+$/, ""), secretKey }
}

async function medusaRequest<T>(endpoint: string): Promise<T> {
    const { baseUrl, secretKey } = getMedusaConfig()
    const authorization = Buffer.from(`${secretKey}:`).toString("base64")
    const response = await fetch(`${baseUrl}${endpoint}`, {
        method: "GET",
        headers: {
            Accept: "application/json",
            Authorization: `Basic ${authorization}`
        }
    })

    if (!response.ok) {
        const responseBody = await response.text()
        let errorMessage = responseBody
        try {
            const parsed: unknown = JSON.parse(responseBody)
            if (
                typeof parsed === "object"
                && parsed !== null
                && "message" in parsed
                && typeof parsed.message === "string"
            ) {
                errorMessage = parsed.message
            }
        } catch {
            
        }
        throw new Error(`Medusa Admin API error (${response.status}): ${errorMessage}`)
    }

    return response.json() as Promise<T>
}

const productFields = [
    "id",
    "title",
    "handle",
    "description",
    "*variants",
    "*variants.prices",
    "*variants.options",
    "+variants.inventory_quantity"
].join(",")

export async function getMedusaProducts(
    limit = 50,
    offset = 0
): Promise<MedusaProductPage> {
    if (!Number.isInteger(limit) || limit < 1)
        throw new RangeError("limit must be a positive integer")
    if (!Number.isInteger(offset) || offset < 0)
        throw new RangeError("offset must be a non-negative integer")

    const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
        fields: productFields
    })

    return medusaRequest<MedusaProductPage>(`/admin/products?${params}`)
}

export async function getMedusaProduct(
    productId: string
): Promise<{ product: MedusaProduct }> {
    if (!productId.trim())
        throw new Error("productId is required")

    const params = new URLSearchParams({ fields: productFields })
    return medusaRequest<{ product: MedusaProduct }>(
        `/admin/products/${encodeURIComponent(productId)}?${params}`
    )
}

export async function getMedusaVariant(
    variantId: string
): Promise<MedusaProductVariant | null> {
    if (!variantId.trim())
        throw new Error("variantId is required")

    const params = new URLSearchParams({
        id: variantId,
        limit: "1",
        offset: "0",
        fields: [
            "id",
            "title",
            "sku",
            "product_id",
            "manage_inventory",
            "allow_backorder",
            "*options",
            "*prices",
            "+inventory_quantity"
        ].join(",")
    })
    const response = await medusaRequest<MedusaVariantPage>(
        `/admin/product-variants?${params}`
    )

    return response.variants.find((variant) => variant.id === variantId) ?? null
}