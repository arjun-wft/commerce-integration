import { findProductById } from "../products/products.repository.js"
import { createVariant as createVariantRepo,
    findVariantByCommerceId , findVariantById , findVariantByProductId,
    updateVariantByCommerceId as updateVariantRepo , upsertVariant , deleteVariantById as deleteVariantRepo,
    deleteVairantByCommerceId as deleteVairantByCommerceIdRepo
} from "./variants.repository.js"

import type { commerceVairantInput, updateVariantInput } from "./variants.types.js"

export async function createVariant(data:commerceVairantInput){
    if(!data.commerceVariantId.trim())
        throw new Error('Commerce Vairant ID is not provided')

    if(!data.productId)
        throw new Error("Product ID is missing")

    const product = await findProductById(data.productId)
    if (!product)
        throw new Error("Parent product not found")

    const variant = await createVariantRepo(data)
    return variant
}

export async function getVariantById(id:string){
    if(!id.trim())
        throw new Error("Id is missing")

    const variant = await findVariantById(id)
    if(!variant)
        throw new Error("Variant not found")

    return variant
}

export async function getVariantByCommerceId(id:string){
    if(!id.trim())
        throw new Error("Id is missing")

    const variant = await findVariantByCommerceId(id)
    return variant
}

export async function getVariantByProductId(id:string){
    if(!id.trim())
        throw new Error("Product id is missing")
    
    const variants = await findVariantByProductId(id)
    return variants
}

export async function updateVariant(commerceVairantId:string , data:updateVariantInput){
    if(!commerceVairantId.trim())
        throw new Error('Id is not present')

    const updatedVariant = await updateVariantRepo(commerceVairantId, data)
    return updatedVariant
}

export async function syncVariantProduct(data:commerceVairantInput){
    if(!data.commerceVariantId)
        throw new Error("Commerce vairant id is missing")

    const product = await findProductById(data.productId)
    if (!product)
        throw new Error("Parent product not found")

    return await upsertVariant({
        sku:data.sku,
        options:data.options,
        title:data.title,
        price:data.price,
        inventoryQuantity:data.inventoryQuantity,
        commerceVariantId:data.commerceVariantId,
        productId:data.productId
    })
}

export async function deleteVariant(id:string){
    if(!id.trim())
        throw new Error("Id is missing")

    return await deleteVariantRepo(id)
}

export async function deleteByVariantId(commerceVairantId:string){

    if(!commerceVairantId.trim()){
        throw new Error('Commerce Vairant ID is Not Provided')
    }

    const vairant = await deleteVairantByCommerceIdRepo(commerceVairantId)
    return vairant
}