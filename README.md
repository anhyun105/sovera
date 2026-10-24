# Sovera — Value your Soul

**Live preview:** https://anhyun105.github.io/sovera/  
**Source repository:** https://github.com/anhyun105/sovera

Sovera is a black-and-gold couture-inspired fashion atelier prototype. It pairs the SV identity with a responsive landing page, a custom Three.js garment viewer and a private-first creative workflow.

## Included in the live prototype

- Responsive editorial landing page and logo intro.
- Interactive 3D garment concept viewer with orbit, zoom, turntable rotation, 12 material choices, colour changes, garment categories and embellishment controls.
- Illustrative 1D tech pack and 2D sketch tabs, and a 4D-style motion/turntable preview.
- Guest browsing in view-only mode and tab-session preview profiles.
- Personal dashboard with saved-concept counts, private/public demo status, material count, recent activity, open and delete controls.
- Browser-local concept save and publish demo, sample Explore cards, likes/comments preview UI.
- Local photo overlay preview; photos are not uploaded by the site.
- GitHub Actions validation and automatic Pages deployment.
- Privacy-first Supabase schema starter under `supabase/`.

## Important: prototype, not production CAD

The 3D garment is a stylised concept mesh, not production-grade cloth simulation or pattern engineering. The 1D/2D tabs are illustrative. The 4D tab is a turntable animation, not cloth physics. Photo preview is a simple overlay, not AI body fitting.

The profile form is **not real authentication**. It does not verify email, and it does not sync data between browsers/devices. Saved concepts live in the current browser's local storage. Publishing is a local demo interaction, not a real shared community post. Do not enter a real password or upload confidential designs/personal photos to the prototype.

To launch as a real community, connect Supabase Auth and storage/database APIs, apply and test the RLS policies, implement server-side preview signing/moderation/admin analytics, and replace local-only community interactions. See [Supabase setup](supabase/README.md) and [Security notes](SECURITY.md).

## Deployment

Push changes to `main`. The workflow validates the HTML and JavaScript syntax, then deploys the root static site to GitHub Pages. Watch the [Actions workflow](https://github.com/anhyun105/sovera/actions) for the latest result.

The site loads Three.js, fonts and editorial inspiration images from third-party CDNs, which must be reachable in the visitor's browser.
