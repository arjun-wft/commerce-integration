import {
    createProduct as createProductRepo, findProductById, findProductByCommerceId, findByHandle,
    updateProduct as updatedProductRepo,
    upsertProduct,
    updateFromDirectus,
    findAllProducts,
    deleteProduct as deleteProductRepo,
    unlinkFromDirectus as unlinkFromDirectusRepo,
    deleteByCommerceId as deleteByCommerceIdRepo,
    updateProductByCommerceId as updateProductByCommerceIdRepo
} from "./products.repository.js"

import type { createProductInput, updateProductInput, commerceProductInput, cmsContentInput } from "./products.types.js"

export async function createProduct(data: createProductInput) {
    if (!data.commerceProductId) {
        throw new Error("Commerce Product ID is required")
    }

    if (!data.title.trim()) {
        throw new Error("Product title is missing")
    }

    const product = await createProductRepo(data)
    return product
}

export async function getProductById(id: string) {
    if (!id.trim()) {
        throw new Error("ID is missing to find product")
    }

    const product = await findProductById(id)
    if (!product)
        throw new Error("Product is Missing")

    return product
}

export async function getProductByCommerceId(id: string) {
    if (!id.trim())
        throw new Error("Commerce id is missing")

    return await findProductByCommerceId(id)
}

export async function getproductByHandle(handle: string) {
    if (!handle.trim())
        throw new Error("Handle not found")

    const product = await findByHandle(handle)
    if (!product)
        throw new Error("Product not found")

    return product
}

export async function updateProduct(id: string, data: updateProductInput) {
    if (!id.trim())
        throw new Error("ID is missing to find product")

    const existingProduct = await findProductById(id)
    if (!existingProduct)
        throw new Error("Product not found to update")

    if (Object.keys(data).length === 0)
        throw new Error("Atleast one field is required to update that")

    if (data.title !== undefined && !data.title.trim())
        throw new Error("Product title cannot be empty")

    const updatedProduct = await updatedProductRepo(id, data)
    return updatedProduct
}

export async function updateProductByCommerceId(commerceProductId:string , data:updateProductInput){
    if(!commerceProductId.trim())
        throw new Error("Commerce ID is not present")

    const updatedProduct = await updateProductByCommerceIdRepo(commerceProductId , data)
    return updateProduct
}

export async function syncCommerceProduct(data: commerceProductInput) {
    if (!data.id.trim())
        throw new Error('Id is not present')

    if (data.handle && !data.handle.trim())
        throw new Error("Handle is not present")

    if (!data.title.trim())
        throw new Error("Title not present")

    const syncedProduct = await upsertProduct({
        handle: data.handle,
        title: data.title,
        description: data.description,
        commerceProductId: data.id
    })

    return syncedProduct
}

export async function syncCmsContent(commerceProductId: string, cmsData: cmsContentInput) {
    if (!commerceProductId.trim())
        throw new Error("Commerce ID is not present")

    if (!cmsData.cmsContentId)
        throw new Error('CMS content id is not present')

    const updateCms = await updateFromDirectus(commerceProductId, cmsData)
    if (!updateCms)
        throw new Error("Commerce product not found for CMS content");

    return updateCms
}

export async function getAllProduct() {
    return await findAllProducts()
}

export async function deleteProduct(id: string) {
    if (!id?.trim()) {
        throw new Error("Product ID is required")
    }

    const existingProduct = await findProductById(id)

    if (!existingProduct) {
        throw new Error("Product not found")
    }

    const deletedProduct = await deleteProductRepo(id)

    if (!deletedProduct) {
        throw new Error("Product deletion failed")
    }

    return deletedProduct
}

export async function removeCmsContent(cmsContentId:string){
    if(!cmsContentId.trim())
        throw new Error("Cms Content ID is Missing")

    const result = await unlinkFromDirectusRepo(cmsContentId)
    return {
        success: true,
        unlinkedCount: result.length,
        products: result
    }
}

export async function deleteProductByCommerceId(commerceProductId:string){
    if(!commerceProductId.trim())
        throw new Error("Commerce Product ID is Not Provided")

    const deletedProduct = await deleteByCommerceIdRepo(commerceProductId)
    if(!deletedProduct)
        throw new Error("Product with commerce id is not present")

    return deletedProduct
}