# Sovera — feature status and launch checklist

**Public frontend:** https://anhyun105.github.io/sovera/  
**Source:** https://github.com/anhyun105/sovera  
**Latest deployment and CI:** https://github.com/anhyun105/sovera/actions

Statuses below distinguish code that exists from services actually activated in a live account. The Supabase URL/key in `supabase-config.js` are still blank until the project owner configures them.

| Feature | Current status | What it means |
| --- | --- | --- |
| GitHub Pages hosting | Live | Static Sovera frontend is public. |
| SV branding, responsive luxury UI | Implemented | Black/gold look, intro animation, logo favicon and landing-page sections. |
| Interactive 3D garment studio | Implemented prototype | Three.js stylised garment meshes, rotation/zoom, colour/material, silhouette, neckline, sleeves and embellishment choices. Not production CAD. |
| 12 fabric options | Implemented prototype | Fabric selection changes the mesh material appearance; supplier-quality fabric physics is not modelled. |
| 1D technical pack | Implemented illustrative view | Name, measurements and design options are shown. Not a graded production pattern. |
| 2D sketch | Implemented illustrative view | Outline changes for several garment categories; it is not a manufacturing-ready sewing pattern. |
| 4D view | Implemented motion preview | Turntable rotation only, not cloth simulation or time-based fit modelling. |
| Guest view-only mode | Implemented in frontend | Studio controls are visually/inertly locked until a profile is opened. A public web page cannot hide already-delivered source code from a technical visitor. |
| Preview profile | Available without backend | Temporary tab-session profile for exploring the UI; not a real account and not email-verified. |
| Real email/password login | Code ready, inactive | Needs a Supabase project, credentials, deployed Edge Functions, Auth settings, email confirmations and production SMTP. |
| Private cloud saves and dashboard | Code ready, inactive | Designed around owner-only rows/RLS; needs the schema and Supabase client configured, then tests with two accounts. |
| Shared public designs and signed previews | Code ready, inactive | Publish a separate watermarked image; public gallery function signs the published preview only. Needs Supabase schema, Storage buckets and function deployment. |
| Shared likes | Code ready, inactive | Uses an atomic RPC to toggle a user's like and maintain a count. Needs schema/function configuration and tests. |
| Shared comments and moderation | Code ready, inactive | New comments are pending until a moderator approves them. Needs deployed functions and an assigned admin/moderator. |
| Content and creator reports | Code ready, inactive | Includes reports for designs, comments and creators; moderation code supports takedown and admin-only 7-day account suspension. Requires backend deployment and testing. |
| Admin dashboard and activity analytics | Code ready, inactive | Server-only metrics/audit log; requires an assigned administrator and deployed Edge Functions. It intentionally avoids collecting photos or full design JSON in analytics. |
| Account deletion | Code ready, inactive | Function removes stored original assets/previews, then deletes the Auth user and cascading database rows. Requires live backend, permissions and a deletion test. |
| Local photo overlay | Implemented | A local label overlay on the selected photo; no garment warp/fit engine. |
| AI photo outfit editing | Code ready, inactive | Consent-gated server function using OpenAI image edit, with a per-account rate limit and temporary-upload cleanup. Requires OpenAI API access/key and deployed Supabase functions. Generated output is a visual estimate, not a fit guarantee. |
| Screenshot or external-camera blocking | Not technically guaranteeable | Watermarks, low-resolution previews and signed URL expiry can reduce misuse; a viewer can still screenshot or photograph a screen. |

## What is still required before a true multi-user launch?

1. Create the Supabase project; run and review `supabase/schema.sql`.
2. Set Auth confirmation/redirect URLs and production SMTP.
3. Configure `supabase-config.js` with only the public Supabase URL and publishable key.
4. Set server secrets in Supabase (never in GitHub or browser source): `SOVERA_SUPABASE_URL`, `SOVERA_SUPABASE_PUBLISHABLE_KEY`, `SOVERA_SERVICE_ROLE_KEY`, and, only if AI try-on is wanted, `OPENAI_API_KEY`.
5. Deploy all functions listed in `supabase/config.toml`.
6. Assign an admin UUID in Supabase SQL Editor after verifying the account.
7. Test two separate users for private-row access, private Storage access, publish/unpublish, likes, pending comments, reports, account deletion and AI rate limits.
8. Configure privacy notice/consent, retention, backups, CAPTCHA, SMTP, cost limits and monitoring before advertising the service publicly.

Detailed steps: [Supabase backend guide](supabase/README.md). Security boundaries: [SECURITY.md](SECURITY.md).

## Research references

- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Storage access: https://supabase.com/docs/guides/storage/security/access-control
- Supabase production checklist: https://supabase.com/docs/guides/deployment/going-into-prod
- Supabase SMTP: https://supabase.com/docs/guides/auth/auth-smtp
- OpenAI Image Edit API: https://developers.openai.com/api/reference/resources/images/methods/edit
- OpenAI API data controls: https://developers.openai.com/api/docs/guides/your-data
