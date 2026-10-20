# House Tasks

A small web app for running the cleaning and maintenance of the house.

- **Email + password login** (with "forgot password").
- **Tasks** are *Cleaning* or *Maintenance*, and either **Routine** (repeats every N days / weeks / months / years), **Ad hoc** (one-off on a planned date) or a **Project** (improvement / bigger job).
- Each task has a description, **photos** (taken straight from the phone camera) and a list of **items needed**.
- The **admin** creates tasks and assigns them to a person (or "Anyone").
- Everyone gets a **To-do list**: overdue, today, and the next 7 days. Tick a task off (with an optional note and photo of the finished job). Routine tasks roll forward to their next date automatically; ad hoc and project tasks are marked done.
- **History** of everything ticked off; admins can undo a mistaken tick.
- Works on phones; can be added to the home screen like an app.

Built as a plain static site (no build step). Logins, data and photos live in **Supabase** (free tier). The site is hosted on **Cloudflare Pages** straight from this GitHub repo.

---

## One-time setup (about 15 minutes)

### 1. Create the Supabase project (database, logins, photo storage)

1. Go to <https://supabase.com>, sign up (free) and click **New project**. Pick a region close to you (e.g. *Africa (Cape Town)* if offered, otherwise *West EU*). Save the database password somewhere safe.
2. When the project is ready, open **SQL Editor → New query**, paste in the whole of [`supabase/schema.sql`](supabase/schema.sql) and click **Run**. You should see "Success. No rows returned".
3. Open **Project Settings → API** (or **API Keys**) and copy:
   - the **Project URL** (looks like `https://abcd1234.supabase.co`)
   - the **anon public** key (or the **publishable** key — either works)

### 2. Put those two values in `config.js`

Edit [`config.js`](config.js) on GitHub (pencil icon) and replace the placeholders:

```js
export const SUPABASE_URL = 'https://abcd1234.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOi...';
```

Commit the change. This key is meant to be public; the data is protected by the security rules in the database.

### 3. Host it on Cloudflare Pages

1. Go to <https://dash.cloudflare.com> → **Workers & Pages → Create → Pages → Connect to Git**.
2. Connect your GitHub account and choose this repository.
3. Build settings:
   - **Framework preset:** None
   - **Build command:** *(leave empty)*
   - **Build output directory:** `/`
4. Click **Save and Deploy**. You'll get an address like `https://house-tasks.pages.dev`.

Every time code is pushed to the `main` branch, Cloudflare redeploys automatically.

### 4. Tell Supabase your website address

In Supabase → **Authentication → URL Configuration**:

- **Site URL:** your Cloudflare address, e.g. `https://house-tasks.pages.dev`
- **Redirect URLs:** add the same address (and `https://*.house-tasks.pages.dev` if you want preview deploys to work)

This makes the "confirm your email" and "reset password" links come back to your app.

> Optional: for a household app you may prefer to skip email confirmation. Turn off **Authentication → Sign In / Providers → Email → Confirm email**. People can then sign in straight after creating their account (they still need admin approval to see tasks).

### 5. Create the admin account

Open your site and tap **Create an account**. **The very first account created becomes the admin.** Everyone after that signs up the same way and appears under **People → Waiting for approval** for you to approve.

---

## Using it

| Who | What they can do |
|---|---|
| **Admin** | Add/edit/delete tasks, take photos, assign people, approve or switch off accounts, see everyone's to-do list and full history, undo ticks |
| **Member** | See tasks assigned to them or to "Anyone", view photos/items, tick tasks off with a note or photo, see their own history |

**Adding a task from your phone:** tap the green **+**, then **Take photo** (opens the camera) or **Choose** (from the gallery). Photos are shrunk before upload so they're quick even on mobile data.

**How routine dates work:** if a weekly task due Monday is done on Wednesday, the next one is the following Wednesday. If it's done early (Saturday), the next one stays on the Monday rhythm.

**Pausing** a routine task: edit it and untick **Active**.

**Add to home screen:** in Safari tap Share → *Add to Home Screen*; in Chrome tap ⋮ → *Add to Home screen*.

---

## Files

| File | What it is |
|---|---|
| `index.html` | Page shell |
| `app.js` | The whole app (screens, logic, photo handling) |
| `styles.css` | Look and feel (light and dark mode) |
| `config.js` | Your Supabase URL and key |
| `supabase/schema.sql` | Database tables, security rules and photo storage — run once in Supabase |
| `manifest.webmanifest`, `icon.svg` | Home-screen app icon |

## Security notes

- Every table has row-level security: members can only read tasks assigned to them or to "Anyone", can't edit tasks, and can't change their own role. Ticking off happens through a database function that checks permissions.
- Photos are in a **private** bucket and shown through short-lived signed links.
- New accounts can't see anything until an admin approves them.
