# Store dashboards

Each store gets its own dashboard page you can open from the group Dashboard and the Stores page.

## What you'll see on a store dashboard
- Header: store name, brand, city/state, AI assistant name, and a "Back to all stores" link.
- Stat cards (this store only): Open jobs, New today, Total applicants, Hired.
- Alert when applicants at this store have waited more than 48 hours, with a "Review now" link.
- Pipeline snapshot: how many applicants are in each stage (New, Contacted, Interview, Offer, Hired, etc.).
- Open jobs at this store, each clickable to open the job.
- Most recent applicants at this store (name, job, stage, date applied).

## How you get there
- Group Dashboard: each row in "Stores by applicants" becomes clickable.
- Stores page: each store card gets an "Open dashboard" button (the whole card is clickable; the remove button still works on its own).

## Technical details
- New page `src/routes/_authenticated/stores_.$storeId.tsx` (URL `/stores/<id>`), rendered as its own page, not inside the Stores list.
- Queries filter by both the active group (`useOrg().orgId`) and the store id, so a store from another group shows "Store not found".
- Reuses the existing status labels from `src/lib/jobs.ts` and the same card styling as the group Dashboard.
- No database changes.
