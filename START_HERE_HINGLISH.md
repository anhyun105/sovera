# Sovera — Website aur next steps (Hinglish)

## Live website
**Website kholo:** https://anhyun105.github.io/sovera/  
**GitHub code:** https://github.com/anhyun105/sovera  
**Deployment history:** https://github.com/anhyun105/sovera/actions

Latest deployment successful hone ke baad yeh URL public access ke liye use karo. Agar browser mein purana version dikhe, hard refresh (Ctrl/Cmd + Shift + R) karo.

## Is prototype ko kaise test karein
1. Home page aur Explore gallery guest ke roop mein dekho. Guest mode view-only hai; studio controls, photo preview, like/comment ke liye preview profile chahiye.
2. **Enter Atelier** click karo; preview profile ke liye naam aur email dalo. Ismein password mat dalo—ye real login nahi hai.
3. Garment type, 12 material choices, colour, neckline, sleeves aur embellishment controls change karo; 1D, 2D, 3D aur 4D-style tabs explore karo.
4. **Save concept** se local draft banao; **Publish to Explore** se current browser ke demo gallery mein card add karo.
5. **Dashboard** mein current tab-session profile ke saved concepts dekho, concept open karo ya delete karo.
6. Photo preview sirf local overlay hai; photo upload server par nahi hota.

## Real public launch se pehle
- Supabase project banao aur supabase/schema.sql ko review/test karke apply karo.
- supabase/README.md ke steps ke mutabik real Auth, data storage aur signed preview endpoint integrate karo.
- Private design ke complete geometry/dimensions ko public feed mein kabhi expose mat karo; sirf alag, watermarked preview publish karo.
- Admin analytics, role checks, moderation, data deletion aur rate limits server-side implement/test karo.
- Cross-user access aur storage RLS ko separate test accounts se test karo.

## Current limitations
Yeh functioning frontend prototype hai—production CAD nahi. 3D garment ek stylised mesh hai; 2D sketch illustrative hai; 4D-style view turntable rotation hai, physics simulation nahi. Photo try-on AI body fitting nahi karta. Sign-in/dashboard/community interactions abhi tab-local demo hain, real accounts ya cross-device sync nahi. Website screenshots ya external camera se copying ko 100% prevent nahi kar sakti.

Security plan: [SECURITY.md](SECURITY.md)
Backend setup: [supabase/README.md](supabase/README.md)
