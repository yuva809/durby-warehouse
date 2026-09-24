import { api } from '../lib/apiClient'
import type { ProductImage } from '../types'

export const productImageService = {
  get(productId: string): Promise<ProductImage | null> {
    return api.get<ProductImage | null>(`/products/${productId}/image`)
  },
  lookup(productId: string): Promise<ProductImage> {
    return api.post<ProductImage>(`/products/${productId}/image/lookup`)
  },
  searchAgain(productId: string): Promise<ProductImage> {
    return api.post<ProductImage>(`/products/${productId}/image/search-again`)
  },
  approve(productId: string): Promise<ProductImage> {
    return api.post<ProductImage>(`/products/${productId}/image/approve`)
  },
  upload(productId: string, file: File): Promise<ProductImage> {
    const form = new FormData()
    form.append('file', file)
    return api.postForm<ProductImage>(`/products/${productId}/image/upload`, form)
  },
  remove(productId: string): Promise<void> {
    return api.delete(`/products/${productId}/image`)
  },
}
