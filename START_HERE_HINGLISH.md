# Sovera — live website aur next steps (Hinglish)

## Website links
- **Live frontend:** https://anhyun105.github.io/sovera/
- **GitHub code:** https://github.com/anhyun105/sovera
- **Latest build/deployment:** https://github.com/anhyun105/sovera/actions
- **Privacy notice:** https://anhyun105.github.io/sovera/privacy.html
- **Terms draft:** https://anhyun105.github.io/sovera/terms.html

## Abhi live version kaise test karein
1. Homepage aur Explore gallery guest ke roop mein dekho. Guest mode view-only hai; studio controls, photo preview, like/comment ke liye preview profile chahiye.
2. **Enter Atelier** kholo aur preview profile ke liye naam/email dalo. Is mode mein password enter mat karo—ye real verified account nahi hai.
3. Garment type, 12 materials, colour, neckline, sleeves, embellishment aur measurements change karo. 1D, 2D, 3D, 4D-style tabs explore karo.
4. **New concept** se naya canvas banao. **Save concept** browser-local draft save karta hai; **Publish to Explore** is preview mode mein sirf isi browser ka demo card add karta hai.
5. Dashboard mein local drafts open/delete karke dekho.
6. Photo preview abhi local label overlay hai. AI try-on ka UI/function code ready hai lekin backend config ke bina active nahi hai.

## Real cloud accounts/community activate karne ke liye
1. [Supabase](https://supabase.com/dashboard) par project banao.
2. Supabase **SQL Editor** mein `supabase/schema.sql` review karke run karo.
3. **Authentication → URL Configuration** mein Site URL aur Redirect URL `https://anhyun105.github.io/sovera/` set karo. Public signup se pehle email confirmation, production SMTP aur CAPTCHA/rate limits configure karo.
4. `supabase-config.js` file mein sirf project URL aur **publishable key** set karo. Is file mein secret/service-role key kabhi nahi dalna.
5. Apne computer par Supabase CLI install karke `supabase login`, `supabase link --project-ref YOUR_PROJECT_REF` chalao.
6. `supabase/README.md` mein diye gaye commands se server secrets set karo aur sab Edge Functions deploy karo. OpenAI secret sirf tab set karo jab AI try-on activate karna ho.
7. Apne verified account ka UUID Supabase SQL Editor se `admin_roles` mein `admin` role assign karo. Role ko client-side flag se kabhi grant mat karo.
8. Apne verified admin account se **My Atelier / Administrator overview → Registered account records** kholo. Wahan account search, email verification, joined/last sign-in, designs/comments/likes counts, individual user record history, CSV export aur 7-day suspension/lift controls milenge.
9. Do alag test accounts use karke private design/file isolation, public publish/unpublish, comments moderation, reports, account deletion aur AI rate limit test karo.

## Important limitations
- 3D mesh concept visual hai, production CAD/pattern grading/cloth physics nahi.
- 2D drawing illustrative hai; 4D-style view turntable animation hai.
- AI output, jab connect hoga, visual estimate hoga—real garment fit guarantee nahi.
- Website screenshots ya external camera se copying ko 100% rok nahi sakti; watermark aur limited previews risk kam kar sakte hain.
- Real Supabase project credentials aur server secrets abhi configure karne baaki hain. Isliye Owner account-record dashboard ka cloud data aur shared multi-user features abhi live/verified nahi maane ja sakte; code deployed hai, backend wiring owner setup ke baad hi active hogi.

Detailed guide: [Supabase backend setup](supabase/README.md)  
Feature matrix: [FEATURE_STATUS.md](FEATURE_STATUS.md)  
Privacy boundaries: [SECURITY.md](SECURITY.md)
