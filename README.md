# UpgradeCheck — one GitHub repository, one Vercel project

This bundle keeps the landing page and working calculator in **the same `main` branch**:

~~~text
index.html                    Landing page at /
assets/                       Landing image
calculator/index.html         Calculator at /calculator/
calculator/app.js             Calculator interactions
calculator/catalog.js         Public, read-only Supabase model search
calculator/payback.js         Local payback maths
api/                          Optional Gemini and usage functions at /api/*
lib/                          Server-only logic
package.json                  ES module configuration and tests
supabase.sql                  Optional database setup
test/                         Local automated tests
~~~

There is no need for another GitHub repository or Vercel project. Vercel watches the configured Production Branch, usually `main`, and deploys the whole project directory on each push. Keep the Vercel **Root Directory** set to the GitHub repository root. Do not set it to `calculator` or Vercel will lose the landing page and root `api` functions.

## How to update your existing repo

1. Back up or commit your current landing page.
2. Extract this ZIP. Copy its **contents**, not its enclosing folder, into the root of your existing `UpgradeCheck` repository. Replace the old root `index.html` with this updated landing page; it now links to the calculator and describes the actual product.
3. Commit and push to `main`. On Vercel, check the deployment for both paths:
   - `https://upgradecheck-five.vercel.app/` — landing page
   - `https://upgradecheck-five.vercel.app/calculator/` — model-first calculator
4. On the landing page, click **Compare my fridges**. It should open the calculator. On the calculator, click the UpgradeCheck logo or **Home** to return to the landing page.

To preview without deployment, open the extracted root `index.html`. Its relative link opens `calculator/index.html` in the same folder. Model search requires internet access to Supabase. The manual annual-unit entry and payback calculation also work if the catalogue is unavailable; Gemini requires a deployed website.

## What the calculator needs

The calculator queries `public.refrigerator_models` through Supabase REST as the user searches. It filters by fridge type, brand and model number, then fills annual kWh only for a unique exact model match. It can display Direct Cool, Frost Free, Side by Side and Multi Door entries when those rows exist in the table. The imported initial set contains 100 selected Direct Cool entries captured 28 September 2026, so other types need manual label entry until you import their rows. No selling price is inferred from model data: users enter their checkout price for payback. Missing old label data gives a five-year consumption threshold instead of a guessed payback time.

The page first asks for each fridge's type, brand and model number. It then shows the comparison, editable electricity-price range and optional trade-in. The old repair-quote input is gone. Marking the current fridge as unusable changes the result to a running-cost comparison.

The browser reads model data with the Supabase project URL and **publishable** key in `calculator/catalog.js`. These are public client identifiers, not secrets. The key was transcribed from a screenshot, so copy its exact value from the dashboard into that file before deploying; capitalization and digits matter. Confirm the `public` schema is exposed through the Data API, and `public.refrigerator_models` has a read-only `SELECT` grant and RLS policy for `anon`. Do not use a secret or service-role key in that file. The search requests only the five columns from the working PowerShell example (`brand`, `model_number`, `fridge_type`, `annual_kwh`, `stars`). The calculator now shows a specific error for 400/401/403/404 responses and browser connectivity failures.

The optional **Explain with Gemini**, **Read label photo**, and AI usage count require the server routes and environment variables `GEMINI_API_KEY`, `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`. Run `supabase.sql` once in Supabase for those optional usage tables; it does not create the refrigerator model catalogue. Keep these **server** credentials in Vercel Environment Variables, never in browser code or GitHub. These AI actions share five attempts per browser. The calculator has no limit. Photo extraction requires user confirmation and does not store image bytes in the database.

## Check before submission

Run `npm test` from the repository root. The tests cover local calculation, missing units, no electricity payback, Supabase model matching and manual fallback, API validation, and mocked Gemini/database calls. The mock does not prove that the live Supabase URL/key are correct: after deployment, type an imported model such as `LG GLD235` into the calculator and confirm the annual units fill in. If you use Gemini, test one real explanation and check its usage row in Supabase.

The **Try a filled example** button selects LG GL-B199OSLC and LG GLD235. Using their labelled 190 and 118 units/year and an illustrative ₹25,000 checkout price gives roughly 34.8–49.7 years at ₹7–10/unit. This is a label-based electricity scenario, not guaranteed profit.
