/**
 * "The warehouse" is whichever ACTIVE location the API says has type WAREHOUSE. Its id is a generated database id
 * (only the demo seed happens to use the literal id 'warehouse'), so nothing in the UI may assume a fixed id. The API
 * guarantees a single active warehouse; if data ever held more than one, the first (the API lists locations by name)
 * is used so every screen agrees on the same one.
 */
export interface LocationLike {
  id: string
  type: string
  active: boolean
}

export function pickWarehouse<T extends LocationLike>(locations: readonly T[] | undefined): T | undefined {
  return (locations ?? []).find((l) => l.type === 'WAREHOUSE' && l.active)
}
