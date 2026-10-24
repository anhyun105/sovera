# Sovera — Value your Soul

**Live website:** https://anhyun105.github.io/sovera/  
**GitHub repository:** https://github.com/anhyun105/sovera  
**Deployment and validation history:** https://github.com/anhyun105/sovera/actions

Sovera is a black-and-gold couture-inspired fashion atelier prototype with an interactive Three.js garment workspace and a privacy-first plan for a future multi-user community.

## Frontend features

- Responsive editorial homepage, SV logo intro and branded favicon.
- Interactive stylised garment viewer: rotation, zoom, garment category, colour, 12 materials and embellishment choices.
- Illustrative 1D tech pack and measurement sheet; category-aware 2D outline; 4D-style turntable animation.
- Guest view-only mode; temporary preview profiles; browser-local saved drafts and personal dashboard.
- Explore inspiration gallery, local like/comment preview controls and local photo overlay.
- When configured, frontend paths are prepared for Supabase Auth, private cloud designs, a signed-preview public gallery, shared likes/comments, moderation, account records, per-user activity history, admin analytics and account controls, account deletion and consent-gated AI outfit editing.

## Important distinction

The **static site is live**. The Supabase integration code is in the repository but it is **not active until the owner configures the Supabase project credentials, applies the schema and deploys the Edge Functions**. Until then, the profile and save/publish interactions are browser-local demos. The AI image editing path also needs a valid server-side OpenAI key and model access.

The 3D scene is a stylised concept mesh, not production garment CAD, a graded sewing pattern or cloth-physics simulation. The AI try-on result is a visual estimate and cannot guarantee a real-world fit. No website can reliably prevent screenshots, external-camera capture or recreation of a visible public design.

## Start here

- [Feature status matrix and launch checklist](FEATURE_STATUS.md)
- [Hinglish setup guide](START_HERE_HINGLISH.md)
- [Supabase, authentication, security and AI setup](supabase/README.md)
- [Security/privacy boundaries](SECURITY.md)

## GitHub Pages deployment

Changes pushed to `main` trigger GitHub Actions. The workflow checks HTML/JavaScript structure and syntax before publishing `index.html` to GitHub Pages. Open [Actions](https://github.com/anhyun105/sovera/actions) to verify the latest run.

For the real-user launch, follow [the backend setup guide](supabase/README.md), test cross-user access with two accounts, and complete all tests before inviting users.
