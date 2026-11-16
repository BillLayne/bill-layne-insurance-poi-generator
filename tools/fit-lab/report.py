"""Read a fit-lab result page (Chrome --dump-dom of lab.html or lab-random.html) and report.

For lab.html it prints the numbers to paste into DENSITIES in src/utils/templateBuilder.ts.
The sweep letters are SIGNED, so subtract SIGNATURE_EXTRA from each printed base before pasting.
For both files it reports whether every letter fits one US Letter page in the size the builder chose.
"""
import collections
import html
import re
import sys

PAGE = 1056
SIZES = ("roomy", "standard", "medium", "compact", "snug", "tight")

source = open(sys.argv[1], encoding="utf-8", errors="replace").read()
match = re.search(r'<pre id="out">(.*?)</pre>', source, re.S)
if not match or not match.group(1).startswith("DONE"):
    sys.exit("The lab did not finish. Give Chrome a larger --virtual-time-budget and run it again.")
rows = [line.split() for line in html.unescape(match.group(1)).splitlines()[1:] if line.strip()]
print(len(rows), "letters measured; font faces loaded (min/max):", min(int(r[2]) for r in rows), max(int(r[2]) for r in rows))

sweep, chosen = {}, []
for rid, height, _ in rows:
    height = int(height)
    cell = re.match(r"n(\d+)-lien(\d)-([a-z]+)(-CHOSEN)?$", rid)
    if cell:
        count, lien, size, flag = cell.groups()
        sweep.setdefault((int(lien), int(count)), {})[size] = height
        if flag:
            chosen.append((rid, height))
    else:
        chosen.append((rid, height))


def line_fit(points):
    """Least squares line through (count, height): returns (slope, intercept)."""
    total = len(points)
    mean_x = sum(p[0] for p in points) / total
    mean_y = sum(p[1] for p in points) / total
    slope = sum((p[0] - mean_x) * (p[1] - mean_y) for p in points) / sum((p[0] - mean_x) ** 2 for p in points)
    return slope, mean_y - slope * mean_x


if sweep:
    print("\nCALIBRATION (signed letters)   base     row    lien   | coverage rows that fit: no lienholder / with one")
    for size in SIZES:
        slope0, base0 = line_fit([(count, cells[size]) for (lien, count), cells in sweep.items() if lien == 0])
        slope1, base1 = line_fit([(count, cells[size]) for (lien, count), cells in sweep.items() if lien == 1])
        print(f"  {size:9s} base: {base0:7.1f}  row: {slope0:5.2f}  lien: {base1 - base0:6.1f}   | {int((PAGE - base0) // slope0):3d} / {int((PAGE - base1) // slope1):3d}")

over = [(rid, height - PAGE) for rid, height in chosen if height > PAGE]
spare = sorted((PAGE - height, rid) for rid, height in chosen if height <= PAGE)
sizes = collections.Counter(re.sub(r"-CHOSEN$", "", rid).rsplit("-", 1)[1] for rid, _ in chosen)
print("\nLETTERS IN THE SIZE THE BUILDER CHOSE:", len(chosen), "| sizes used:", dict(sizes))
print("fit on one page:", len(spare), "| run past one page:", len(over))
for rid, extra in over:
    print(f"   past the page by {extra}px: {rid}   (expected only for 'tight' letters that do not print 'Page 1 of 1')")
if spare:
    print("spare px on the letters that fit: min", spare[0][0], "| median", spare[len(spare) // 2][0], "| max", spare[-1][0])
    print("tightest five:", [f"{rid}:{value}" for value, rid in spare[:5]])
