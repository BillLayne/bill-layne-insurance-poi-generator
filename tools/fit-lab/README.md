# Fit lab

The Proof of Insurance letter picks one of six sizes so it prints on one US Letter page.
It chooses by estimating the printed height from the `DENSITIES` table in
`src/utils/templateBuilder.ts`. Those numbers were measured in Chrome with this lab.

Run it after any change to the letter's CSS sizes, fonts or layout.

## Run

From the repo root (Windows, Git Bash):

```bash
OUT="$(pwd)/fit-lab-out"
CHROME="/c/Program Files/Google/Chrome/Application/chrome.exe"

node node_modules/tsx/dist/cli.mjs tools/fit-lab/harness.mts "$OUT"

for page in lab lab-random; do
  "$CHROME" --headless=new --disable-gpu --no-first-run \
    --user-data-dir="$OUT/chrome-profile" --virtual-time-budget=240000 \
    --dump-dom "file:///$(cygpath -m "$OUT")/$page.html" > "$OUT/$page-out.html"
  python tools/fit-lab/report.py "$OUT/$page-out.html"
done
```

`fit-lab-out/` is gitignored. The separate `--user-data-dir` keeps the test away from your own Chrome.

## Read the result

- **`lab.html`** forces every coverage count into every size. The report prints `base`, `row` and
  `lien` for each size. The sweep letters are signed, so subtract `SIGNATURE_EXTRA` (18) from each
  `base`, then paste the numbers into `DENSITIES`. Run the lab again to confirm.
- **`lab-random.html`** is 80 random letters with long names and wrapped text, in the size the
  builder chose. Every letter should fit, with the smallest spare above `SAFETY`. The only letters
  allowed past the page are `tight` ones the builder already knew would not fit (they do not print
  "Page 1 of 1").
- The numbered `*.html` files are sample letters to open and look at. `logos.html` shows every
  carrier logo in the title tile.

Last measured 2026-11-16: 79 of 80 random letters fit with at least 16 px spare; the tightest size
holds about 30 coverage rows without a lienholder and 25 with one.

Synthetic data only. Never put client information in the lab.
