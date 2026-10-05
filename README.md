# UpgradeCheck calculator

This is the **calculator-only** website for the separate calculator repository and Vercel project. The calculator is the homepage at `/`. There is no landing page in this bundle.

~~~text
index.html        Calculator at /
app.js            Calculator interactions
catalog.js        Read-only Supabase refrigerator search
payback.js        Local payback calculation
api/              Optional Gemini and usage functions at /api/*
lib/              Server-only logic
supabase.sql      Optional AI usage database setup
test/             Automated tests
~~~

## Deploy to your calculator repository

1. Extract this ZIP. Copy **its contents**, not the enclosing folder, into the root of your separate calculator GitHub repository. The root must contain `index.html`, `app.js`, `catalog.js`, `payback.js`, `api/`, and `lib/`.
2. If that repository already contains an old landing page or duplicate `calculator/` and `assets/` directories from a combined version, remove those obsolete files after checking that the new root calculator is in place.
3. Commit and push to `main`. In the calculator Vercel project, use the calculator repository with **Root Directory** at the repository root. The project homepage `/` will show the calculator.
4. Test the new homepage and search `LG GLD235`. Its annual units should fill in from Supabase. The previous `/calculator/index.html` path is no longer part of this project.

Keep your separately deployed landing page in its own repository. If it has a “Compare my fridges” button, point that button to this calculator project's public URL.

## Database and calculation

The browser queries `public.refrigerator_models` through Supabase REST, filtered by fridge type, brand and model number. Only a unique exact model match fills annual kWh. The initial imported rows are a selected Direct Cool sample; other types can be searched as you add them or entered manually from their labels. Users enter the new fridge’s checkout price for payback. If the old label is missing, the calculator shows a five-year threshold rather than inventing consumption.

`catalog.js` contains a **publishable** Supabase key and project URL for public read-only model search. Confirm the key character-for-character against your Supabase dashboard. Never put a secret or service-role key in browser code. The `public` schema and table must be exposed via the Data API, and `anon` must have a read-only `SELECT` grant and RLS policy. Search uses `brand`, `model_number`, `fridge_type`, `annual_kwh` and `stars`.

The optional **Explain with Gemini**, **Read label photo**, and usage count need server routes and Vercel environment variables `GEMINI_API_KEY`, `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`. Run `supabase.sql` once for those optional usage tables; it does not create the refrigerator model catalogue. Keep these server credentials out of browser files and GitHub. Manual entry and payback remain available if model search or Gemini is unavailable.

## Verify locally

Run `npm test` from this repository root. To preview the interface, open root `index.html`. Supabase search requires internet access; the calculation works locally with manually entered annual units. Gemini requires the deployed server routes.
