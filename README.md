# Durby Warehouse — V1 Demo Prototype

An interactive, standalone prototype demonstrating how Durby can manage one central
warehouse supplying five grocery branches: stock requests, warehouse review and
approval, transfers, and driver delivery — all connected in one live flow.

This is a **prototype**, not the production system. There is no backend, no auth,
and no database — all data is mock/demo data held in local app state (Zustand),
persisted to `localStorage` so the demo survives a page refresh. Use the **Reset
Demo** button (top right) to restore the starting seed data at any time.

## Running it

```bash
npm install
npm run dev
```

Open the printed local URL (usually http://localhost:5173).

## How to demo it

Use the **Viewing as** switcher (top right) instead of logging in — it swaps the
whole interface between Overview, Warehouse Manager, each of the 5 branches, and
Delivery Person.

A full walkthrough script: switch to **Branch 3** → **Request Stock** (Rice,
Cooking Oil, Sugar) → switch to **Warehouse Manager** → open the new request,
adjust Sugar down, **Approve** → **Assign Driver** → switch to **Delivery
Person** → **Start Picking** → **Start Delivery** → **Mark Delivered** → switch
back to **Branch 3** and watch the inventory numbers update live. Check
**Activity** for the full audit trail.

## Architecture notes (for the eventual real build)

Pages talk to a thin service layer (`src/services/*`) — `inventoryService`,
`requestService`, `transferService`, `deliveryService`, `activityService` —
which today just reads/writes the local Zustand store (`src/store`). When a
real backend exists, only those service files need to change to call a real
API; pages and components don't need to know the difference.
