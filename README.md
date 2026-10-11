# Locked In

A study app for students: focus timer that counts real minutes, a shelf for PYQ links, PDF tools, an engineering doubt desk and a squad board. Static site (HTML, CSS, JS) with Supabase for login and data, hosted on Vercel.

Made with love by Ujjwal. [LinkedIn](https://www.linkedin.com/in/ujjwal-sharma-60a58734a) · [GitHub](https://github.com/ujjwalsharmaa2007)

## What it costs

| Part | Plan | Cost |
| --- | --- | --- |
| Hosting (Vercel) | Hobby | Free, for personal non-commercial use. If you start charging money for the app, check Vercel's terms and expect to need a paid plan. |
| Login and data (Supabase) | Free | Free. A free project pauses after a week of no use, and you wake it from the dashboard. |
| Doubt desk (Claude API) | Pay as you go | Not free. You need an API key with a few dollars of credit. It is optional. The app works without it. |

Supabase's built-in email sender is limited to a handful of emails per hour. That is fine for testing. Turn off "Confirm email" while you launch (step 3), then add your own email provider later.

## Setup (about 30 minutes)

### 1. Make a Supabase project
1. Sign up at supabase.com and create a new project. Save the database password somewhere.
2. Open **SQL Editor**, paste everything from `supabase/schema.sql`, press **Run**.
3. Open **Project Settings > API**. Copy the **Project URL** and the **anon public key**.

### 2. Add your keys
Open `config.js` and replace the two placeholders with the values you copied.
The anon key is meant to be public. Never paste the `service_role` key anywhere.

### 3. Login settings in Supabase
Under **Authentication**:
- Email provider: on.
- To skip email confirmation while testing, turn **Confirm email** off.
- After deploying (step 5), set **Site URL** to your Vercel address and add the same address to **Redirect URLs**. Password reset links use this.

### 4. Put the project on GitHub
1. Create a new repository on github.com.
2. Upload every file in this folder (the web page lets you drag and drop). Keep the folders `api` and `supabase` as they are.

### 5. Deploy on Vercel
1. Sign in at vercel.com with your GitHub account.
2. **Add New > Project**, pick your repository, leave the framework as **Other**, press **Deploy**.
3. Open the address Vercel gives you. Sign up with a test email and try it.

### 6. Optional: switch on the doubt desk
In Vercel, open the project, then **Settings > Environment Variables**, and add:
- `SUPABASE_URL`: same Project URL as in config.js
- `SUPABASE_ANON_KEY`: same anon key as in config.js
- `ANTHROPIC_API_KEY`: from console.anthropic.com (needs billing set up)
- `ASK_DAILY_LIMIT`: questions per person per 24 hours (default 5)

Redeploy once so the variables apply. The key stays on the server, so students never see it. Watch your spend in the Anthropic console, and lower `ASK_DAILY_LIMIT` if it grows fast.

## How data is protected
- Every table uses row level security, so a person can only read and change their own rows.
- The squad board is the only shared table. It holds a nickname, weekly hours, streak and level, and only for people who join.
- "Delete my data" in Customize removes a person's rows. Deleting the login itself is done in the Supabase dashboard under Authentication.

## Files
- `index.html`, `styles.css`, `app.js`: the app
- `config.js`: your Supabase URL and anon key
- `api/ask.js`: the optional doubt desk (Vercel serverless function)
- `supabase/schema.sql`: tables and security rules
- `vercel.json`: gives the doubt desk 30 seconds per answer
