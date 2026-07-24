# G-Ops Forms

Responsive G-Ops forms website with an admin area for airline gate forms and videos.

## Admin Login Setup

The admin portal uses username/password credentials stored as Vercel environment variables.

Required Vercel environment variables:

- `ADMIN_USERNAME`: Admin username.
- `ADMIN_PASSWORD`: Admin password.

Change these values in Vercel whenever you want to rotate the login credentials.

After changing Vercel environment variables, redeploy the project so the serverless login endpoint uses the latest values.
