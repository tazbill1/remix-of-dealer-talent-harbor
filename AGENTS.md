<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Multi-tenant: every tenant table has `org_id`; RLS uses `is_org_member` / `has_org_role` / `is_platform_admin`. Why: dealer groups' data must never mix.
- Roles live in `org_members` and `platform_admins`, never on profiles. Why: prevents privilege escalation.
- New groups are created only through the `create_organization` RPC. Why: atomically makes the creator group admin.
- Public applicant writes (apply, status lookup) go through server functions in `src/lib/public.functions.ts` using the admin client after validation. Why: applicants have no login and tables have no anon write policies.
- Resumes live in the private `resumes` bucket at `<org_id>/<application_id>/...`, uploaded via signed upload URLs. Why: storage RLS keys off the first folder.
- Signed-in app pages live under `src/routes/_authenticated/`; the active group comes from `useOrg()`. Why: one gate and one source of tenant context.
- Brand colors are tokens in `src/styles.css` (navy, sapphire, ultramarine, lime, chartreuse); the gradient is only via `text-brand-gradient`. Why: brand rules restrict gradient to text accents.
- Job posting is gated by `can_post_jobs` (group admins, recruiters, platform admin); other members may only insert/edit jobs with status `requested`. Why: client requires Recruiting/HR to own job reqs.
