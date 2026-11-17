import envConfig from './env.js'

export interface DirectusResponse {
    id: string;
    medusa_product_id: string;
    seo_title: string | null;
    seo_description: string | null;
    rich_content: string | null;
    content_status: 'published' | 'draft';
}

export interface DirectusResult {
    data: DirectusResponse[];
    meta: {
        total_count: number;
    };
}

export interface DirectusResult {
    data: DirectusResponse[];
    meta: {
        total_count: number;
    };
}
export async function getDirectusProducts(limit: number = 50, offset: number = 0) {
    const params = new URLSearchParams({
        limit: String(limit),
        offset: String(offset),
        fields: [
            "id",
            "medusa_product_id",
            "seo_title",
            "seo_description",
            "rich_content",
            'content_status'
        ].join(','),
        meta: 'total_count'
    })

    const result = await fetch(`${envConfig.DIRECTUS_BASE_URL}/items/product_contents?${params}`, {
        headers: {
            Authorization: `Bearer ${envConfig.DIRECTUS_TOKEN}`
        }
    })

    if (!result.ok) {
        throw new Error(
            `Directus API failed: ${result.status} ${await result.text()}`
        )
    }

    return await result.json() as DirectusResult
}

export async function getDirectusProductById(id: string): Promise<DirectusResponse> {
    if (!id.trim()) {
        throw new Error("Directus item ID is required")
    }

    const params = new URLSearchParams({
        fields: [
            "id",
            "medusa_product_id",
            "seo_title",
            "seo_description",
            "rich_content",
            "content_status"
        ].join(',')
    })

    const result = await fetch(
        `${envConfig.DIRECTUS_BASE_URL}/items/product_contents/${encodeURIComponent(id)}?${params}`,
        {
            headers: {
                Authorization: `Bearer ${envConfig.DIRECTUS_TOKEN}`
            }
        }
    )

    if (!result.ok) {
        throw new Error(
            `Directus API failed: ${result.status} ${await result.text()}`
        )
    }

    const response = await result.json() as { data: DirectusResponse }

    return response.data
}