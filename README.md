# Bill Layne Insurance POI Generator

Proof of Insurance generator exported from Google AI Studio and adapted for:

- local Vite development
- secure Cloudflare Pages deployment
- Gemini 3 Flash parsing/refinement through server-side API routes

## Local run

Prerequisites:
- Node.js 20+

Steps:
1. `npm install`
2. Copy `.env.example` to `.env.local`
3. Set `GEMINI_API_KEY` in `.env.local`
4. Run `npm run dev`

In local development, the app can still call Gemini directly so it behaves the same as the AI Studio export.

## Cloudflare Pages

This repo includes Pages Functions in [`functions/api`](./functions/api) so the Gemini key stays server-side when deployed.

Build settings:
- Build command: `npm run build`
- Build output directory: `dist`

Environment variables:
- `GEMINI_API_KEY`

Optional local Pages testing:
1. Copy `.dev.vars.example` to `.dev.vars`
2. Add your `GEMINI_API_KEY`
3. Deploy with `npm run build` and `npm run deploy:pages -- --project-name <your-project-name>`

## Notes

- Primary Gemini model: `gemini-3-flash-preview`
- Fallback model: `gemini-2.5-flash`
- The UI and document workflow are kept intentionally close to the original AI Studio version.

## The Proof of Insurance letter (Speedee print look, November 2026)

`src/utils/templateBuilder.ts` builds the letter that is previewed, printed and downloaded.

- **Look:** the agency's Speedee White style on a US Letter sheet. Outfit type, navy `#0A1F44`, royal `#003F87`, a gold `#FFC72C` pill and total row, light-blue card headers, rounded cards, the agency badge in the header and the carrier logo in a tile beside the title. Print colors are forced on (`print-color-adjust: exact`), so the letter prints the same with or without the browser's "Background graphics" box.
- **One page:** the letter has six sizes (`roomy`, `standard`, `medium`, `compact`, `snug`, `tight`). `pickDensity()` estimates the printed height of each from numbers measured in Chrome and uses the roomiest one that fits. At the tightest size it holds about 30 coverage rows without a lienholder and 25 with one (the old Arial letter clipped silently after 21 and 13). A longer policy runs onto a second page: nothing is cut off, and the "Page 1 of 1" note is left out.
- **If you change the CSS sizes,** re-measure and update the `DENSITIES` table in the same file (`base`, `row` and `lien` are pixels at 96 dpi), or the fit estimate drifts.
- **Logos** come from `src/constants.ts`: the agency badge and the white-background carrier logos on `img.billlayneinsurance.com`. Hagerty and NC Grange still use their old imgur links. Carriers listed in `CARRIER_LOGO_NEEDS_NAME` have a symbol-only logo, so the name prints beside it. A carrier with no logo prints its name in the tile.
- Everything printed on the letter is HTML-escaped, so a name with `&` or `<` in it prints as typed.
- **Download PDF** waits for the logos and the font before it opens the print dialog. The signature image uses a full address, so a saved HTML letter still shows it.

## Deploying

The live site is the Cloudflare Pages project `bill-layne-insurance-poi-generator`, deployed by direct upload (there is no Git build):

1. `npm run lint`
2. `npm run build`
3. `npx wrangler pages deploy dist --project-name bill-layne-insurance-poi-generator --branch main`

**The Gemini key never goes in the build.** `vite.config.ts` passes `GEMINI_API_KEY` to the browser only for `npm run dev`. A production build that carried it would publish the key in the public JavaScript; the hosted site reads the key from the Pages environment through `functions/api`. Before deploying, this must print nothing:

    grep -o "AIza[0-9A-Za-z_-]*" dist/assets/*.js
