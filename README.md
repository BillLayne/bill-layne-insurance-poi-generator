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
