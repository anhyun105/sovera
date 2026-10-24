# Sovera security and privacy notes

## Current hosting vs. active services

The static website is live on GitHub Pages. The repository contains a prepared Supabase schema and Edge Functions for cloud accounts, private design storage, signed public previews, likes/comments, reports, moderation, admin analytics, account deletion and AI try-on. **Those cloud services are not active until the owner creates/configures a Supabase project, applies the schema, sets server secrets and deploys the Edge Functions.** The public configuration file currently contains empty credential placeholders.

In preview mode, the signup form creates only a tab-local preview profile. Saved designs are browser-local; the profile is not email-verified and there is no cross-device sync. Do not enter a real password or upload confidential design/photo data to the preview version.

## Privacy model when the backend is configured

- Full design geometry and measurements live in owner-only `designs`, protected by row-level security (RLS).
- The public Explore feed is served through `public-gallery`, which returns selected metadata and time-limited signed URLs only for explicitly published watermarked previews.
- `design-assets` and `public-design-previews` are private Storage buckets. Never change either bucket to public.
- Comments begin as pending; a trusted moderator must approve them.
- Reports, admin roles, audit events and AI usage records are server-only. The browser must never access a Supabase secret/service-role key.
- AI photo editing is available only after explicit consent, uses temporary private upload, validates file type/size and reserves a maximum of five requests per account per hour. Provider terms/safety review/retention can still apply.
- Self-service account deletion removes user-owned Storage assets before deleting the Auth account and cascaded database records.
- Public creator/user identifiers are not intentionally returned in the public feed or likes API. Administrative logs contain allowlisted operational metadata only.

## Launch security checklist

1. Apply `supabase/schema.sql` to a fresh project and review the grants/policies against current Supabase docs.
2. Set email confirmation, production SMTP, password-reset redirects, CAPTCHA and Auth rate limits before public signups.
3. Configure only a public/publishable key in `supabase-config.js`. Keep `SOVERA_SERVICE_ROLE_KEY` and `OPENAI_API_KEY` in Supabase server secrets.
4. Deploy every function in `supabase/config.toml` and confirm its JWT/CORS rules.
5. Test with two unrelated accounts and negative tests: guest access, A trying to read/update/delete B's rows/files, unpublish, comment approval, creator report, non-admin access to admin APIs, rate limits, deletion cleanup and failed AI cleanup.
6. Define a documented retention schedule, backup/restore policy, privacy support contact, legal notice and incident/appeal process.
7. Set spending controls for image generation and monitor request rates, failures and storage cleanup.
8. Don't call the service production-ready until those tests pass in the real Supabase project.

Run tests and review docs: [Feature status](FEATURE_STATUS.md), [Supabase launch guide](supabase/README.md), [Privacy notice](privacy.html), [Terms draft](terms.html).

## Screenshot and copying limits

No browser-only or hosted website can reliably prevent a viewer from taking a screenshot, recording the screen with software/hardware or photographing it with another device. Watermarks, reduced-resolution previews, signed URL expiry, access controls and abuse monitoring reduce risk but do not guarantee zero copying.
