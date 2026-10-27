# Access rules update: store and region scoping

**Status:** proposed. Nothing in this file has been applied to the database yet.

Like the first data model update, this goes through **Lovable** (it changes database
access rules, which live in Lovable Cloud). Paste the prompt below into Lovable's chat.

## What it fixes

1. **Hiring managers can see every store's candidates.** The client wants corporate
   recruiters and HR to see everything, regional leaders to see their region, and GMs and
   hiring managers to see their own stores.
2. **Deleting a region that still has stores fails** at the database level. The app now
   unassigns stores first, but the database should do it too.
3. **The WerkandMe Admin can't see the new tables** (regions, candidates, check-ins,
   scopes) when stepping into a dealer group, because their policies only check group
   membership.
4. **Duplicate check-ins are possible** for the same hire and mark.

## Prompt to paste into Lovable

> Please update database access rules. Keep the existing RLS pattern and don't remove
> columns.
>
> 1. **Store scoping.** Create a security definer function
>    `can_access_store(_org uuid, _store uuid, _uid uuid) returns boolean` that is true when:
>    the user is a platform admin; or the user is a `group_admin` or `recruiter` in that
>    group; or the user's `org_members` row in that group has no rows in
>    `org_member_scopes` (no scopes assigned yet means the whole group, so nothing breaks
>    today); or one of their scopes matches the store directly (`dealership_id`) or matches
>    the store's region (`region_id` equals `dealerships.region_id`).
> 2. Use `can_access_store(org_id, dealership_id, auth.uid())` in the SELECT, UPDATE and
>    DELETE policies on `applications` (in addition to group membership). For
>    `application_events`, `messages`, `interviews` and `retention_checkins`, allow access
>    when the user can access the store of the related application. For `candidates`,
>    allow SELECT when the user can access at least one of that candidate's applications,
>    and always for group admins and recruiters.
> 3. **Platform admin access.** Add `or is_platform_admin(auth.uid())` to the policies on
>    `regions`, `org_member_scopes`, `candidates` and `retention_checkins`, matching the
>    other tables.
> 4. **Region delete.** Change the foreign key `dealerships.region_id` to
>    `on delete set null`, and add an index on `dealerships(region_id)`.
> 5. **One check-in per mark.** Add a unique constraint on
>    `retention_checkins(application_id, day_mark)`.
> 6. **Team page.** Add a "Team" page in the sidebar for group admins: list the group's
>    members with their role, let a group admin change a member's role (group admin,
>    recruiter, regional leader, dealer manager, hiring manager), and assign the regions
>    and/or stores each regional leader, GM or hiring manager covers (writes
>    `org_member_scopes`). If inviting new members needs email sending that isn't set up
>    yet, skip invites for now and only manage existing members.

## How to check it worked

1. Create a test user, add them as a **hiring manager**, and on the Team page give them
   one store.
2. Sign in as that user. The Applicants and Analytics pages should only show that store.
3. Give a second test user the **regional leader** role with one region. They should see
   every store in that region and nothing else.
4. A recruiter or group admin should still see everything.

Use test data only until this is checked.
