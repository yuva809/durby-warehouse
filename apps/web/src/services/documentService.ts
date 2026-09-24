import { api, triggerDownload } from '../lib/apiClient'

/**
 * Both documents are rendered server-side, fresh from the database, on
 * every download — there is no client-side PDF generation and nothing
 * cached here, so these work the same after a refresh or a fresh login.
 */
export const documentService = {
  async downloadOrderConfirmation(requestId: string, ocNumber: string) {
    const blob = await api.getBlob(`/requests/${requestId}/order-confirmation`)
    triggerDownload(blob, `Order-Confirmation-${ocNumber}.pdf`)
  },
  async downloadDeliveryChallan(transferId: string, dcNumber: string) {
    const blob = await api.getBlob(`/transfers/${transferId}/delivery-challan`)
    triggerDownload(blob, `Delivery-Challan-${dcNumber}.pdf`)
  },
}
