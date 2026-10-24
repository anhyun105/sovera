# Sovera — Value your Soul

Sovera is a black-and-gold fashion-atélier website prototype. It uses a custom SV monogram, a couture-inspired home page, an interactive Three.js garment preview, material/color controls, 1D/2D/3D/4D-style workspace tabs, sample inspiration gallery, local preview profiles, and private/public concept controls.

## Website
The website is published from `index.html` using GitHub Pages. Changes pushed to `main` automatically trigger `.github/workflows/deploy.yml`.

## Prototype features
- Responsive Sovera branding and animated logo intro.
- Interactive Three.js garment scene with orbit, zoom, rotation, material/color and garment-category options.
- Illustrative 1D tech pack, 2D sketch, and 4D-style turntable preview.
- Browser-local concept save/publish demo.
- Approximate local photo overlay preview; photos are not uploaded by this page.
- Sample inspiration gallery with demo likes and comments UI.

## Important limitations
This is a frontend prototype, **not production-grade fashion CAD**. The 1D/2D views are illustrative, the 3D garment is a stylised concept mesh, 4D is a turntable animation rather than cloth physics, and photo try-on is a label overlay rather than AI body fitting.

Sign-up creates a browser-local demo profile only. It does not verify email or provide secure authentication, cloud syncing, or a real shared community. Real accounts, public posting, comments, admin analytics, and private cloud storage require a secure backend (for example, Supabase Auth, database Row Level Security, private Storage policies, moderation and retention controls).

No ordinary website can guarantee screenshot or external-camera prevention. Avoid inviting users to upload private designs or personal photos until backend permissions and privacy practices have been reviewed.

## Deploy
1. Push changes to `main`.
2. Open repository **Settings → Pages** and choose **GitHub Actions** as the source if asked.
3. Open **Actions** and wait for **Deploy Sovera to GitHub Pages** to finish successfully.
4. The site URL appears in the deployment summary and **Settings → Pages**.

The 3D library, fonts and inspiration images load from third-party CDNs.
