# Sovera security notes

## Current public site status

The GitHub Pages site is a public frontend prototype. Its preview sign-up is not real authentication. It stores a temporary profile in tab session storage and saved design concepts in that browser's local storage. It does not verify email, upload cloud designs, or share actual community activity across browsers. Do not type a real password or upload confidential work into this prototype.

## What public and private mean in this prototype

- Guest visitors can browse the public landing page and inspiration gallery.
- The studio and save controls prompt for a preview profile.
- New concepts are marked private in this browser until the creator chooses the demo Publish control.
- Publishing adds a card to the current browser's demo gallery only; it does not create a live public user post.
- Browser-local storage is not a secure vault. Anyone with access to the same browser profile can potentially inspect it.

## Before accepting real users

1. Replace the demo profile UI with Supabase Auth and verified email flows.
2. Apply and test `supabase/schema.sql` in a fresh Supabase project, reviewing it against the project's current database version and default grants.
3. Keep complete design payloads in owner-only `designs`; expose only selected preview metadata in `public_designs`.
4. Keep source design files and personal photos in a private storage bucket. Serve a watermarked preview only through a server-side handler that verifies publication status.
5. Put moderation, admin roles, audit analytics, signed preview URLs, rate limits and deletion operations behind trusted Edge Functions or a server. Never put a Supabase secret or service-role key into HTML, JavaScript, a public repository or client storage.
6. Add automated RLS tests for guest access, owner access, cross-user access, publish/unpublish, comments, likes and storage paths.
7. Define a privacy notice, user consent, retention schedule, account deletion and reporting/appeal process before launch.
8. Add abuse protection and moderation for public comments, uploads and account signups.

## Copying and screenshot limitations

No website can reliably stop a viewer from photographing a screen, using external recording hardware, or recreating a visible public design. Watermarks, permission checks, rate limits and limited preview resolution can reduce risk but cannot promise zero copying.

Report security concerns privately to the repository owner rather than including secrets or private user data in public issues.
