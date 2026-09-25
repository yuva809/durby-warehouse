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

/**
 * The URL a catalog/list view may actually render. A FOUND_NEEDS_REVIEW
 * candidate is an unreviewed guess (below the auto-match confidence
 * threshold) and must not be shown as if it were the product's image:
 * status and confidence still travel with the response so the UI can flag
 * it as pending review, but no displayable URL does. The manager's review
 * panel reads the candidate from GET /products/:id/image instead, so the
 * review/approval workflow is unaffected.
 */
export function displayImageUrl(productId: string, image: { status: string; imageUrl: string | null } | null | undefined): string | null {
  if (!image || image.status === 'FOUND_NEEDS_REVIEW') return null;
  return effectiveImageUrl(productId, image);
}
