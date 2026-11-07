# DezartWash Admin

Admin website for DezartWash: dashboard with charts, bookings, rider approvals
(documents and ID review), riders, services, monthly plans, coupons, customers
and chat. Built with React and Vite, backed by Supabase.

## Run locally

```
npm install
cp .env.example .env     # then fill in the values
npm run dev
```

## Settings (environment variables)

| Name | What it is |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | The public anon key (never the service_role key) |
| `VITE_FIREBASE_VAPID_KEY` | Web push public key (Firebase, Cloud Messaging) |

## Deploy (Vercel or Netlify)

- Build command: `npm run build`
- Output directory: `dist`
- Add the three environment variables above in the host's settings.
- In Supabase, add the site address under Authentication, URL Configuration.

## Security

Only the public anon key is used here. All access is limited by row-level
security in the database, and only users with the `admin` role can use the
panel. Never commit `.env` files or any secret key.
