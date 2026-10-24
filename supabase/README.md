# Sovera backend: secure launch guide

The GitHub Pages website is live. The cloud integration code in this folder is prepared, but the project currently has empty Supabase browser credentials. Real authentication, cloud saves, cross-user community, AI try-on and admin analytics remain inactive until you create/configure a Supabase project and deploy these functions. Do not invite real users until you complete the tests below.

## Architecture

- **Static frontend:** GitHub Pages at `https://anhyun105.github.io/sovera/`.
- **Authentication:** Supabase Auth with email/password. Email verification depends on your Auth settings and outbound SMTP configuration.
- **Private design data:** `public.designs` contains full design JSON and measurements; RLS restricts rows to their owner.
- **Public community:** `public.public_designs` contains selected display metadata plus a path to a separate watermarked preview. The table and preview path are not readable by anonymous clients. `public-gallery` checks the published rows on the server and returns a short-lived signed URL.
- **Private files:** originals, personal photos and source assets use the private `design-assets` bucket.
- **Published images:** watermarked concept images use `public-design-previews`, also private. The gallery returns a signed URL only for a currently published row.
- **Community actions:** atomic like/unlike RPC, comments initially marked pending, content reports and moderation actions.
- **Admin-only operations:** analytics, searchable account records, per-user activity history, 7-day suspension/un-suspension, moderation queues, role checks and activity events run through Edge Functions with a server secret.
- **AI photo preview:** consent-gated function that accepts a private temporary photo, calls the OpenAI image-edit endpoint, records a rate-limited request and deletes the temporary original after processing.
- **Account deletion:** authenticated self-service function removes source assets and published-preview files before deleting the Supabase Auth user and cascaded database rows.

## 1. Create the Supabase project

1. Create a project at [Supabase](https://supabase.com/dashboard).
2. Use a strong database password and enable MFA on the owner account.
3. In **Project Settings → API**, copy the Project URL and the **publishable key**. For browser code use only this publishable key (or a legacy anon key protected by tested RLS).
4. Never add a secret/service-role key to `index.html`, `supabase-config.js`, client storage, browser JavaScript or a public repo.

## 2. Apply the database schema

**Recommended: use the checked-in migration.** After `supabase login` and `supabase link --project-ref YOUR_PROJECT_REF`, run:

```bash
supabase db push
```

This applies `supabase/migrations/20261025000000_sovera_initial_schema.sql`. The repository keeps `schema.sql` as a readable SQL Editor copy, and CI verifies that both files stay byte-for-byte synchronized. If you prefer the Dashboard, review and run `schema.sql` in **SQL Editor** instead; do not maintain two different schema versions.

The schema creates tables, RLS policies, private Storage buckets, signed-preview access design, like toggle RPC, creator-reporting tables and AI rate-limit reservation. After applying it, verify in **Database → Tables** that all expected tables exist and RLS is enabled. If you previously applied an older draft, take a backup and review the changes first.

The repository contains pgTAP checks in `supabase/tests/sovera_security.test.sql`. To run them locally, install Docker and the Supabase CLI, then run:

```bash
supabase start
supabase test db
```

The tests check baseline grants/RLS/private storage and server-only functions. They do not replace two-account end-to-end tests against the configured project.

## 3. Configure Auth and email delivery

In **Authentication → URL Configuration**:

- Site URL: `https://anhyun105.github.io/sovera/`
- Add that URL to Redirect URLs; add only callback/preview URLs you actually use.
- Turn email confirmation on before public signup.
- Configure a production SMTP provider in **Authentication → SMTP Settings**; default/test mail limits are not suitable for a live public service.
- Configure password reset and email confirmation templates.
- Enable CAPTCHA/bot protection and tune sign-up / OTP rate limits before inviting users.

The browser auth form enables passwords only after a Supabase URL and publishable key are present. In preview mode it never asks for a password and cannot verify an email.

References:
- Auth: https://supabase.com/docs/guides/auth
- SMTP: https://supabase.com/docs/guides/auth/auth-smtp
- Production checklist: https://supabase.com/docs/guides/deployment/going-into-prod

## 4. Deploy Edge Functions

Install the Supabase CLI, log in and link the project:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
```

Set server-side secrets through the CLI (replace placeholders in your own terminal; do not paste real keys into chat, documentation or source code):

```bash
supabase secrets set \
  SOVERA_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co \
  SOVERA_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY \
  SOVERA_SERVICE_ROLE_KEY=YOUR_SERVER_SECRET_OR_SERVICE_ROLE_KEY \
  OPENAI_API_KEY=YOUR_OPENAI_API_KEY
```

Deploy the secured functions:

```bash
supabase functions deploy public-gallery
supabase functions deploy track-activity
supabase functions deploy report-content
supabase functions deploy moderate-content
supabase functions deploy admin-dashboard
supabase functions deploy admin-users
supabase functions deploy delete-my-account
supabase functions deploy virtual-try-on
```

The function configuration is in `config.toml`. Only `public-gallery` accepts unauthenticated requests because it exposes the public community feed, not private design data. All other functions require a valid signed-in session. The `admin-users` function is owner/admin-only and uses the Auth Admin API on the server to show registered users, verification/sign-in status, saved-design/comment/like counts, per-user event history and account suspension controls. Its aggregate RPC is granted only to `service_role`. Edge Function secrets must remain in Supabase server settings.

## 5. Connect the browser safely

Edit `supabase-config.js` in your own GitHub repo and set:

```js
export const SUPABASE_URL = "https://YOUR_PROJECT_REF.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "YOUR_PUBLISHABLE_KEY";
```

Commit the change. These values are public in a static website, so they must be publishable/anon credentials only. Security comes from RLS and server-side authorization, not from hiding a public key.

The GitHub Pages workflow deploys automatically after every push to `main`. Check the **Actions** tab and verify the run completes successfully. Then test with two different email accounts.

## 6. Configure an administrator account

After creating/verifying the correct account in **Authentication → Users**, copy its exact user UUID. In Supabase SQL Editor, assign the role yourself:

```sql
insert into public.admin_roles (user_id, role)
values ('YOUR_VERIFIED_AUTH_USER_UUID', 'admin')
on conflict (user_id) do update set role = excluded.role;
```

Do not grant roles using client-side flags, a submitted email, local storage or a public signup form. The admin dashboard Edge Function checks `admin_roles` server-side. Moderators can review content; only an admin can suspend a reported creator.

## 7. Privacy, public designs and AI photo try-on

- Publishing makes a separate, watermarked **preview image** shareable. Full design geometry, measurements and source files remain owner-only.
- Private preview files are in a private Storage bucket. The public gallery gets a signed URL that expires after 15 minutes.
- Original photos are stored temporarily under the authenticated user's private folder. The AI endpoint requires explicit consent, accepts JPEG/PNG/WebP up to 12 MB and limits each account to five attempts per hour with an atomic database reservation.
- AI try-on is a visual estimate, not a garment-fit or size guarantee. It requires a working OpenAI API project/key, model access and budget limits.
- The photo is sent to OpenAI for image editing when the user consents. Review OpenAI's data controls and policies before launch; API image inputs may be processed under abuse-monitoring and safety policies. Closing the UI does not undo an already-transmitted request.
- Temporary original uploads are removed after the function runs; configure retention/deletion policies and test failure paths. Generated preview images are displayed client-side and are not automatically saved to the design library.
- No web page can reliably prevent a viewer from taking a screenshot, filming the display with another device or recreating a visible public design. Watermarks and limited previews reduce copying risk; they cannot guarantee zero copying.

References:
- RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Storage access: https://supabase.com/docs/guides/storage/security/access-control
- Edge Function secrets: https://supabase.com/docs/guides/functions/secrets
- OpenAI Image Edit API: https://developers.openai.com/api/reference/resources/images/methods/edit
- OpenAI API data controls: https://developers.openai.com/api/docs/guides/your-data

## 8. Must-pass launch checks

Using two test accounts (A and B), verify all of the following before inviting users:

1. Guest cannot create a profile-backed cloud design, like, comment, report or upload a photo.
2. Account A cannot read/update/delete Account B's designs, photos or source files—even if A knows B's UUID or storage path.
3. Private design paths are not returned from the public database API or public gallery endpoint.
4. Unpublishing removes the public row, removes the old preview object and causes the gallery to stop serving it.
5. A creator can change/delete their own designs but cannot change another creator's rows.
6. Likes are unique per user/design; counts are updated atomically.
7. New comments stay pending until a moderator approves them.
8. Non-admins receive 403 from admin dashboard and cannot suspend accounts.
9. Report rate limits and AI rate limits work under concurrent requests.
10. Account deletion removes the user's photos, previews, private designs, profile and Auth account; test failures and cleanup logs.
11. Test with browser network devtools and inspect API responses for leaked email addresses, user UUIDs, private paths, raw measurement JSON and secret values.
12. Configure backups/restore, monitoring, rate limits, CAPTCHA, SMTP, privacy notice and account deletion support before production.

## Current integration status

The code and database setup are in the repository, but **the hosted app remains in preview mode until Supabase credentials and deployed Edge Functions are configured**. AI preview remains unavailable until the server-side OpenAI key is set. No key is included in this repository.
