# UpgradeCheck calculator

This is the **calculator-only** website for the separate calculator repository and Vercel project. The calculator is the homepage at `/`. There is no landing page in this bundle.

~~~text
index.html        Calculator at /
app.js            Photo-first calculator interactions
catalog.js        Read-only Supabase refrigerator search
payback.js        Local payback calculation
api/              Optional Gemini functions at /api/*
lib/              Server-only logic
test/             Automated tests
~~~

## Deploy to your calculator repository

1. Extract this ZIP. Copy **its contents**, not the enclosing folder, into the root of your separate calculator GitHub repository. The root must contain `index.html`, `app.js`, `catalog.js`, `payback.js`, `api/`, and `lib/`.
2. If that repository already contains an old landing page or duplicate `calculator/` and `assets/` directories from a combined version, remove those obsolete files after checking that the new root calculator is in place.
3. Commit and push to `main`. In the calculator Vercel project, use the calculator repository with **Root Directory** at the repository root. The project homepage `/` will show the calculator.
4. Test the new homepage and search `LG GLD235`. Its annual units should fill in from Supabase. The previous `/calculator/index.html` path is no longer part of this project.

Keep your separately deployed landing page in its own repository. If it has a “Compare my fridges” button, point that button to this calculator project's public URL.

## Database and calculation

Each fridge card starts with **one optional photo upload**. The browser reads up to 100 models from the public Supabase catalogue and sends their names and types alongside the photo to Gemini. Gemini reports only visible fridge details and may suggest the closest catalogue entry if it sees a recognizable brand and type. Since the catalogue has model names rather than reference photos, a visual suggestion cannot identify the exact model or its electricity use. Users review the suggestion and may explicitly choose **Use suggestion as illustration**; the comparison then marks its annual units and payback as a proxy, not a reliable forecast. If a printed model number is visible, the browser checks `public.refrigerator_models` for a unique exact match. A visible BEE label can supply annual units after review. No second photo is requested; manual details remain available in a collapsed section.

The initial imported rows are a selected Direct Cool sample; other types can be searched as you add them or entered manually from their labels. Users enter the new fridge’s checkout price for payback. If the old label is missing, the calculator shows a five-year threshold rather than inventing consumption.

“Try a filled example” uses clearly labelled, illustrative fridge figures built into the page, so it works even when model search is unavailable. It does not claim these figures came from BEE or represent an actual model. Users should replace all sample values with their own before making a decision.

`catalog.js` contains a **publishable** Supabase key and project URL for public read-only model search. Confirm the key character-for-character against your Supabase dashboard. Never put a secret or service-role key in browser code. The `public` schema and table must be exposed via the Data API, and `anon` must have a read-only `SELECT` grant and RLS policy. Search uses `brand`, `model_number`, `fridge_type`, `annual_kwh` and `stars`.

The optional **Explain with Gemini** and **Identify from photo** features need server routes and one Vercel environment variable, `GEMINI_API_KEY`. Keep this key in Vercel, never in browser files or GitHub. The browser stores a shared count of five AI attempts in `localStorage`, including attempts that fail after a request starts. Requests rejected for an invalid Gemini key or provider quota do not consume a browser attempt. The image is sent to Gemini for identification; images, extracted text, prompts and answers are not written to Supabase. The separate, read-only refrigerator catalogue still uses Supabase. Manual entry and payback remain available if model search or Gemini is unavailable.

The browser count is a convenience limit only: clearing storage, changing browsers, or calling `/api/check` and `/api/label` directly bypasses it. It does not enforce a cost limit for the Gemini key. Set a provider quota or other server-side protection before a public launch if spending must be capped. If you previously created `upgradecheck_quota`, `claim_upgradecheck` or `upgrade_checks` in Supabase, the new code does not use them. It also does not delete existing data; inspect and remove obsolete objects separately if desired. The server no longer needs `SUPABASE_SERVICE_KEY` or `SUPABASE_URL`, though `catalog.js` still contains the public project URL and publishable key for fridge search.

## Verify locally

Run `npm test` from this repository root. To preview the interface, open root `index.html`. Supabase search requires internet access; the calculation works locally with manually entered annual units. Gemini requires the deployed server routes.
