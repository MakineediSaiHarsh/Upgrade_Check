# UpgradeCheck calculator

This is the **calculator-only** website for the separate calculator repository and Vercel project. The calculator is the homepage at `/`. There is no landing page in this bundle.

~~~text
index.html        Calculator at /
app.js            Photo-first calculator interactions
catalog.js        Browser catalogue search through /api/models
payback.js        Local payback calculation
api/              Gemini, model search and count functions at /api/*
lib/              Server-only logic
supabase/          SQL for the Gemini call table
test/             Automated tests
~~~

## Deploy to your calculator repository

1. Extract this ZIP. Copy **its contents**, not the enclosing folder, into the root of your separate calculator GitHub repository. The root must contain `index.html`, `app.js`, `catalog.js`, `payback.js`, `api/`, and `lib/`.
2. If that repository already contains an old landing page or duplicate `calculator/` and `assets/` directories from a combined version, remove those obsolete files after checking that the new root calculator is in place.
3. Run `supabase/gemini_calls.sql` in your project's Supabase SQL Editor. Keep the existing `public.refrigerator_models` table.
4. In the **calculator** Vercel project's Production environment, set `GEMINI_API_KEY`, `SUPABASE_URL` (the project URL) and `SUPABASE_SERVICE_KEY` (prefer a current `sb_secret_...` key from Supabase API Keys; a legacy service-role JWT is also supported). Never use a publishable or anon key for `SUPABASE_SERVICE_KEY`. Enter raw values with no surrounding quotes.
5. Commit and push to `main`. In the calculator Vercel project, use the calculator repository with **Root Directory** at the repository root. Redeploy after adding or changing environment variables. The homepage `/` will show the calculator.
6. Open `/api/stats`; it should return `{"recordedCalls":0}` on a new table. Search `LG GLD235` and check that annual units populate. Use one photo or explanation, then refresh `/api/stats`: its count should increase by one. The previous `/calculator/index.html` path is no longer part of this project.

Keep your separately deployed landing page in its own repository. If it has a “Compare my fridges” button, point that button to this calculator project's public URL.

## Database and calculation

Each fridge card starts with **one optional photo upload**. Gemini reports only details visible in the image. If no model number or annual units are visible, the browser searches `public.refrigerator_models` for models of that brand and type and automatically fills an illustrative catalogue model. It prioritizes the nearest listed capacity when capacity is visible. Otherwise it uses a representative model near the median capacity and energy figure for that brand and type. The review panel lets the user choose a different listed model or revert to visible details only. A brand and fridge type cannot establish the exact model or its electricity use; any projected payback using this match is expressly illustrative and must be checked against the real fridge. If a printed model number is visible, the browser checks for a unique exact match. A visible BEE label can supply annual units after review. No second photo is requested; manual details remain available in a collapsed section.

The initial imported rows are a selected Direct Cool sample; other types can be searched as you add them or entered manually from their labels. Users enter the new fridge’s checkout price for payback. If the old label is missing, the calculator shows a five-year threshold rather than inventing consumption.

“Try a filled example” uses clearly labelled, illustrative fridge figures built into the page, so it works even when model search is unavailable. It does not claim these figures came from BEE or represent an actual model. Users should replace all sample values with their own before making a decision.

The browser's `catalog.js` calls `/api/models`; the Vercel function calls Supabase with a server-only key and returns only six approved catalogue columns. The `public.refrigerator_models` table must be exposed through the Supabase Data API. Browser access to that table is no longer required by this version. Search uses `brand`, `model_number`, `fridge_type`, `total_volume_l`, `annual_kwh` and `stars`. The route restricts fridge types and caps results at 60 rows.

The **Explain with Gemini** and **Identify from photo** functions use `gemini-3.5-flash-lite`. `GEMINI_API_KEY` and `SUPABASE_SERVICE_KEY` live only in the Vercel server environment. A row in `public.gemini_calls` is inserted before each Gemini request and updated with its status, sanitized input/output summary, and Google's usage token counts when available. Photo bytes are sent to Gemini but never stored in this table; the free-form question is also omitted from persistent input logs. Extracted details and generated explanations are stored. The page fetches an exact count of these rows through `/api/stats`. A pending row remains if the follow-up database update fails. If the initial insert fails, Gemini still runs, but the page clearly marks that request as **not recorded**. Fix the setup before collecting assignment evidence.

If the page says a request was not recorded, first open `/api/stats` on the deployed calculator. The response now distinguishes a missing URL, missing key, publishable key used in place of a secret, missing `gemini_calls` table, rejected key, and incompatible table schema. Make sure the environment variables are in the **calculator** Vercel project for **Production**, run the SQL in the same Supabase project as `SUPABASE_URL`, and redeploy. The diagnostic never prints the key or raw database error. Requests made while logging is unavailable are not counted later.

The separate browser count of five attempts remains a convenience limit only: clearing storage, changing browsers, or calling `/api/check` and `/api/label` directly bypasses it. The database count measures requests, **not unique visitors or a server-enforced quota**. Set a Gemini provider quota or a server-side rate limit before public launch if spending must be capped. Existing `upgradecheck_quota`, `claim_upgradecheck` or `upgrade_checks` objects are not used or deleted by this code.

For assignment evidence, make at least five AI requests after deployment. In Supabase Table Editor inspect `gemini_calls`, or run the two commented queries at the bottom of `supabase/gemini_calls.sql` for five recent rows and mean input/output tokens. Record the actual values and a screenshot; do not use test fixture numbers as live measurements. The public counter includes successes, provider errors, transport errors, and pending records. It has no personal identity or per-user breakdown.

## If Google rejects the Gemini key

The key appearing in Vercel does not prove Google accepts it. Confirm that `GEMINI_API_KEY` is set in the **calculator** Vercel project for the **Production** environment, with the raw key value and no surrounding quotes. New or changed environment variables need a new production deployment. In the Google AI Studio API Keys page, inspect the exact key's project, blocked status and restrictions. Google blocks certain leaked or dormant keys and rejects unrestricted standard keys; a current AI Studio auth key restricted to the Gemini API is the simplest replacement. A browser-restricted key can fail from Vercel's server, and a project-level access denial will not be solved merely by adding the same key again. The site now distinguishes these causes when Google's error body identifies them, without showing Google's raw error text or the secret. Never paste the key into a support message, screenshot, or repository.

## Verify locally

Run `npm test` from this repository root. To preview the interface, open root `index.html`. Catalogue search, the count and Gemini require the deployed server routes. The calculator works locally with manually entered annual units.
