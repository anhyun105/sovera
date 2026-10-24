# Supabase backend setup for Sovera

This folder is a **secure schema starter**, not a connected backend yet. The deployed site currently uses a temporary browser-session profile and browser-local design storage. It does not call Supabase, verify email addresses, or sync data across users or devices.

## What the schema is designed to protect

- `designs` contains the complete design payload and is readable only by its owner.
- `public_designs` contains only approved display metadata and a path to a separately rendered/watermarked preview. It deliberately does not contain pattern geometry, full measurements or the source design payload.
- `design-comments` begin as pending; only trusted moderation code should mark them visible.
- `design-assets` is private and permits authenticated access only to files under the user's own UUID folder.
- `admin_roles` and `activity_events` have no browser-facing grants or policies. Access them from trusted server-side Edge Functions using a secret key.
- Changing a design from public to private automatically removes its public preview row.

## Setup

1. Create a Supabase project.
2. In **SQL Editor**, review and run `schema.sql`.
3. In **Authentication → URL Configuration**, set the Site URL to `https://anhyun105.github.io/sovera/` and add that same URL plus any approved callback routes to Redirect URLs.
4. Configure an appropriate email provider and verify sign-up / password reset behavior before enabling production accounts.
5. Choose the app's published identity and photo retention rules. Do not store personal try-on photos unless you have a lawful purpose, clear user consent, retention/deletion rules and access checks.
6. Implement the client integration using only the project's publishable key (or legacy anon key) with RLS enforced. **Never place a Supabase secret or service-role key in the browser or GitHub Pages code.**
7. Implement trusted Edge Functions for: public preview signing, event logging, moderation/report queues, admin analytics and account deletion. Each function must verify the user, check owner/role permissions server-side, validate fields and rate-limit abuse.
8. Use test accounts to verify that User A cannot read, update, sign, or delete User B's private designs, photos, drafts or events. Also test unauthenticated access and unpublishing.
9. Only after all tests pass should the preview-only form be replaced with real Supabase Auth and cloud persistence.

## Important design decision

The full design remains private even when a user shares an Explore card. Publish a separate, watermarked preview image and selected metadata. Since public designs can be copied, users must explicitly consent to publishing. A browser cannot reliably prevent screenshots or external-camera capture.

## Admin role assignment

After confirming the administrator's actual `auth.users.id` UUID, a project owner may insert that UUID into `public.admin_roles` from the Supabase SQL Editor. Do not create an admin role based only on a client-provided email, local-storage flag or form field. An Edge Function must check this table with server-side credentials before returning audit analytics or allowing moderation actions.

## Reference docs

- Supabase Row Level Security: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Storage access control: https://supabase.com/docs/guides/storage/security/access-control
- Supabase secure data: https://supabase.com/docs/guides/database/secure-data
