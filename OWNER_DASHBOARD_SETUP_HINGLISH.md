# Sovera Owner Dashboard — setup guide (Hinglish)

**Live website:** https://anhyun105.github.io/sovera/  
**Supabase Dashboard:** https://supabase.com/dashboard  
**Project repository:** https://github.com/anhyun105/sovera

## Owner-only lock kya hai?

Sovera ke Owner Dashboard ko sirf tumhare verified account ke liye lock kiya gaya hai. Privileged server endpoints do checks karte hain:

1. Tumhare sign-in session ka Auth UUID Supabase ke private server secret `SOVERA_OWNER_USER_ID` se exactly match hona chahiye.
2. Usi UUID ka `admin` role `public.admin_roles` mein hona chahiye.

Dono mein se kuch bhi missing/mismatch hua toh dashboard/user-record/admin action deny hoga. Iska matlab sirf website par admin button hide nahi kiya gaya; server par bhi owner ID verify hoti hai.

**Security boundary:** Jo vyakti tumhare Supabase project ka Owner/Administrator access, tumhara email account, ya GitHub write access control karta hai, woh server configuration badal sakta hai. In accounts par MFA/2-step verification lagao aur credentials share mat karo. Sirf website par ordinary signup karne wala koi aur user owner nahi ban sakta.

## Setup ek baar karna hai

### 1. Apna private Supabase project banao
1. https://supabase.com/dashboard par jao aur apne account se project create karo.
2. Supabase project ke owner ke taur par sirf apne trusted account ko rakho. Dashboard par MFA enable karo.
3. **Project Settings → API** se project URL aur public/publishable key copy karo. **Secret/service-role key kabhi browser code mein mat daalna.**

### 2. Database setup karo
Project ke SQL Editor mein is repository ki `supabase/schema.sql` file review karke run karo, **ya** local Supabase CLI se migration use karo:

```bash
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

Ek hi method choose karo. CLI migration apply karne ke baad wahi schema dobara manually run mat karna.

### 3. Frontend ko project se connect karo
GitHub repository mein `supabase-config.js` kholo aur sirf ye do public values apne project se replace karo:

```js
export const SUPABASE_URL = "https://YOUR_PROJECT_REF.supabase.co";
export const SUPABASE_PUBLISHABLE_KEY = "YOUR_PUBLISHABLE_KEY";
```

Commit karne se live frontend update hoga. Is file mein secret/service-role key bilkul mat rakhna.

### 4. Email verification on karo
Supabase **Authentication → URL Configuration** mein Site URL aur allowed redirect `https://anhyun105.github.io/sovera/` set karo. Email confirmation on karo aur production SMTP setup karo. Gmail/Supabase email verify hone se pehle user ko real verified account mat samajhna.

### 5. Edge Functions deploy karo
Apne computer par Supabase CLI install karke project link karne ke baad:

```bash
supabase functions deploy public-gallery
supabase functions deploy admin-dashboard
supabase functions deploy admin-users
supabase functions deploy moderate-content
supabase functions deploy report-content
supabase functions deploy track-activity
supabase functions deploy delete-my-account
supabase functions deploy virtual-try-on
```

AI photo try-on ke liye apni OpenAI API key ko Supabase **Edge Function Secrets** mein `OPENAI_API_KEY` naam se add karo. Agar AI abhi nahi chahiye toh is step ko skip kar sakti ho; key ko GitHub ya website code mein kabhi mat rakho.

### 6. Apna owner account create aur verify karo
1. Live Sovera par apne hi email se account create karo aur confirmation email se verify karo.
2. Supabase **Authentication → Users** par jao, apna verified account select karo aur uska exact **User UID / UUID** copy karo.
3. Usi UUID ko database mein admin role do. Supabase SQL Editor mein `YOUR_VERIFIED_AUTH_USER_UUID` ki jagah apna copied UUID daal kar run karo:

```sql
insert into public.admin_roles (user_id, role)
values ('YOUR_VERIFIED_AUTH_USER_UUID', 'admin')
on conflict (user_id) do update set role = excluded.role;
```

### 7. Server ka owner lock set karo — yeh zaroori hai
Supabase **Edge Functions → Secrets** mein secret add karo:

- **Name:** `SOVERA_OWNER_USER_ID`
- **Value:** wahi exact verified Auth UUID jo step 6 mein copy kiya.

CLI alternative:

```bash
supabase secrets set SOVERA_OWNER_USER_ID=YOUR_VERIFIED_AUTH_USER_UUID
```

Yeh UUID database ke admin role se bilkul match hona chahiye. Is secret ko GitHub, public document ya browser mein mat daalna. Secret badalne ke baad deployed functions ise server environment se read karengi.

## Owner Dashboard kahan milega?

1. https://anhyun105.github.io/sovera/ kholo.
2. Apne verified owner account se **Sign in** karo.
3. **My Atelier / personal dashboard** kholo.
4. Dashboard ke neeche **Administrator overview → Registered account records** section milega.

Yahan account search (email/name/ID), email confirmation status, join date, last sign-in, saved/published designs ke counts, comments/likes, per-user design/activity records, current page CSV export, aur 7-day suspend/lift controls available honge.

## Confirm karo ki koi dusra user admin nahi hai

- Doosre email se ek normal test account banao; us account ko owner dashboard/data nahi milna chahiye.
- Agar us account ko direct owner endpoint call karne ka try bhi karna ho, server ko forbidden response dena chahiye.
- Kisi aur user ko `admin_roles` mein `admin` mat do. Owner secret set na ho toh owner controls intentionally fail closed rahenge.
- Supabase aur GitHub ke account par MFA enable rakho aur unke passwords/recovery codes kisi se share mat karo.

Normal user phir bhi apne designs create/edit, published designs like/comment/report kar sakta hai (jab backend active ho). Woh doosron ke private designs ya account records nahi dekh sakta aur admin actions nahi kar sakta.

## Kya owner dekh sakti hai, aur kya nahi?

Owner account records, status, design list metadata, comments aur recorded activity dekh sakta hai. System passwords, active login tokens, private original photos ya unnecessary raw measurement payloads ko admin analytics mein expose nahi karta. Screenshot rokne ki 100% guarantee kisi website par possible nahi hai.

**Important:** Code aur owner-lock check repository mein prepared hain, lekin real cloud user records tabhi dikhenge jab tum apne Supabase project ko configure karke setup ke steps complete karogi.
