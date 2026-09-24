/**
 * A manual upload stores bytes on the ProductImage row (served via its own
 * GET .../image/file endpoint), never a URL — every other status stores a
 * real external URL directly. Every read path that surfaces an image needs
 * this same "what do I actually point <img src> at" computation, so it
 * lives here once rather than being repeated in ProductsService,
 * SupplierInvoicesService, and ProductImagesService.
 */
export function effectiveImageUrl(productId: string, image: { status: string; imageUrl: string | null } | null | undefined): string | null {
  if (!image) return null;
  return image.status === 'MANUAL_UPLOAD' ? `/products/${productId}/image/file` : image.imageUrl;
}
