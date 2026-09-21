# Durby Warehouse — Frontend (V1 UI)

An interactive prototype demonstrating how Durby can manage one central
warehouse supplying five grocery branches: stock requests, warehouse review
and approval, transfers, and driver delivery — all connected in one live
flow.

This UI was built as a **frontend-only prototype** — no backend, no auth, no
database, all data held in local app state (Zustand) persisted to
`localStorage`. A real backend now exists at `../api` (see the root
`DEPLOY.md`), but this frontend has not yet been rewired to call it — it
still runs entirely on local state, same as V1. Use the **Reset Demo**
button (top right) to restore the starting seed data at any time.

## Running it standalone

```bash
npm install
npm run dev
```

Open the printed local URL (usually http://localhost:5173).

## How to demo it

Use the **Viewing as** switcher (top right) instead of logging in — it swaps
the whole interface between Overview, Warehouse Manager, each of the 5
branches, and Delivery Person.

A full walkthrough: switch to a branch → **Request Stock** → switch to
**Warehouse Manager** → open the new request, adjust a quantity down,
**Approve** → **Assign Driver** → switch to **Delivery Person** → **Start
Picking** → **Start Delivery** → **Mark Delivered** → switch back to the
branch and watch the inventory numbers update live. Check **Activity** for
the full audit trail.

## Architecture notes

Pages talk to a thin service layer (`src/services/*`) — `inventoryService`,
`requestService`, `transferService`, `deliveryService`, `activityService` —
which today just reads/writes the local Zustand store (`src/store`). The
plan (see root status report) is for these same files to become the API
client layer calling `../api`, without pages/components needing to change.
