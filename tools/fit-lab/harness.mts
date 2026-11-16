// Fit lab for the Proof of Insurance letter.
//
// Builds synthetic letters with the REAL template builder and writes pages that
// measure their printed height in Chrome. Use it after changing the letter's CSS
// sizes, to refresh the DENSITIES table in src/utils/templateBuilder.ts and to
// confirm letters still fit one US Letter page. See tools/fit-lab/README.md.
//
// Synthetic data only. Never put client information in this file.
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildPOIDocument } from "../../src/utils/templateBuilder.ts";
import { CARRIER_LOGOS } from "../../src/constants.ts";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.resolve(process.argv[2] || path.join(os.tmpdir(), "poi-fit-lab"));
const SIGNATURE = pathToFileURL(path.join(REPO, "public/bill-layne-signature.png")).href;
const NL = String.fromCharCode(10);
const SIZES = ["roomy", "standard", "medium", "compact", "snug", "tight"];
const DATE = "11/16/2026";

const AUTO = [
  ["Bodily Injury Liability", "$100,000 each person / $300,000 each accident", "", "$212.00"],
  ["Property Damage Liability", "$50,000 each accident", "", "$148.00"],
  ["Uninsured / Underinsured Motorist Bodily Injury", "$100,000 each person / $300,000 each accident", "", "$41.00"],
  ["Uninsured Motorist Property Damage", "$50,000 each accident", "$100", "$12.00"],
  ["Medical Payments", "$1,000 each person", "", "$18.00"],
  ["Comprehensive", "Actual Cash Value", "$500", "$96.00"],
  ["Collision", "Actual Cash Value", "$500", "$241.00"],
  ["Rental Reimbursement", "$50 per day / $1,500 maximum", "", "$22.00"],
  ["Roadside Assistance", "Included", "", "$9.00"],
  ["Loan / Lease Payoff", "25% of Actual Cash Value", "", "$27.00"],
  ["Custom Parts or Equipment Value", "$1,000", "$500", "$0.00"],
  ["Accident Forgiveness", "Included", "", "$0.00"],
];
const HOME = [
  ["Coverage A - Dwelling", "$342,000", "$1,000", "$1,184.00"],
  ["Coverage B - Other Structures", "$34,200", "$1,000", "Included"],
  ["Coverage C - Personal Property", "$171,000", "$1,000", "Included"],
  ["Coverage D - Loss of Use", "$68,400", "", "Included"],
  ["Coverage E - Personal Liability", "$300,000 each occurrence", "", "$24.00"],
  ["Coverage F - Medical Payments to Others", "$2,000 each person", "", "$6.00"],
  ["Windstorm or Hail", "Included", "1% of Coverage A", "Included"],
  ["Water Backup of Sewers and Drains", "$10,000", "$1,000", "$48.00"],
  ["Equipment Breakdown", "$50,000", "$500", "$35.00"],
  ["Inland Flood", "$25,000", "$1,000", "$62.00"],
  ["Ordinance or Law", "10% of Coverage A", "", "Included"],
  ["Replacement Cost on Contents", "Included", "", "$41.00"],
  ["Identity Fraud Expense", "$15,000", "$250", "$25.00"],
  ["Refrigerated Property", "$500", "$100", "Included"],
  ["Scheduled Personal Property - Jewelry", "$8,500", "", "$93.00"],
  ["Loss Assessment", "$5,000", "$1,000", "$8.00"],
  ["Earthquake", "Not included", "", ""],
  ["Fungi, Wet or Dry Rot, or Bacteria", "$10,000", "", "Included"],
];
const cov = (pool: string[][], count: number) =>
  Array.from({ length: count }, (_, i) => {
    const [name, limit, deductible, premium] = pool[i % pool.length];
    return {
      name: i >= pool.length ? `${name} (${Math.floor(i / pool.length) + 1})` : name,
      limit,
      deductible: deductible || null,
      premium: premium || null,
    };
  });
// Rows that never wrap, so the calibration sweep measures a clean base and row height.
const plainRows = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ name: `Coverage ${i + 1}`, limit: "$50,000", deductible: "$500", premium: "$10.00" }));

const auto = {
  carrier: "Progressive", policyCategory: "auto", policyTypeCode: "Personal Auto", policyNumber: "987654321",
  policyPeriodStart: "11/01/2026", policyPeriodEnd: "05/01/2027", effectiveDate: "11/01/2026",
  namedInsured: "Robin Testcase", coInsured: "Dana Testcase" as string | null, insuredAddress: "101 Example Mill Rd", insuredCity: "Elkin",
  insuredState: "NC", insuredZip: "28621", insuredEmail: "robin.testcase@example.com" as string | null,
  vehicleYear: "2021", vehicleMake: "Ford", vehicleModel: "F-150 XLT SuperCrew", vehicleVIN: "1FTFW1E50MFA00000",
  vehicleType: "Pickup", vehicleLength: null, vehicleUse: "Pleasure", garagingZip: "28621", garagingState: "NC",
  propertyDescription: "", propertyAddress: "", propertyCity: "", propertyState: "", propertyZip: "",
  constructionType: "", occupancyType: "", yearBuilt: "", ratingBase: "Actual Cash Value" as string | null,
  totalAnnualPremium: "$1,652.00", monthlyPayment: null, downPayment: null, paymentPlan: "", lienholderName: null,
  lienholderAddress: null, lienholderCityStateZip: null, coverages: cov(AUTO, 11), discounts: [] as string[], documentDate: DATE,
  customPolicyLabel: null as string | null,
};
const home = {
  ...auto, carrier: "Nationwide", policyCategory: "home", policyTypeCode: "HO-3 Special Form", policyNumber: "63 32 HR 000000",
  policyPeriodStart: "10/14/2026", policyPeriodEnd: "10/14/2027", vehicleYear: "", vehicleMake: "", vehicleModel: "", vehicleVIN: "",
  vehicleType: "", vehicleUse: "", garagingZip: "", garagingState: "", ratingBase: null,
  propertyDescription: "Single Family Dwelling", propertyAddress: "101 Example Mill Rd", propertyCity: "Elkin", propertyState: "NC",
  propertyZip: "28621", constructionType: "Frame, Brick Veneer", occupancyType: "Owner Occupied - Primary", yearBuilt: "1998",
  totalAnnualPremium: "$1,526.00", coverages: cov(HOME, 17),
};
const noLien = { name: "", address: "", cityStateZip: "" };
const plainLien = { name: "Synthetic Credit Union", address: "P.O. Box 000000", cityStateZip: "Salt Lake City, UT 84121" };
const bank = { name: "Synthetic Credit Union", address: ["ISAOA / ATIMA", "P.O. Box 000000", "Loan #: 000123456"].join(NL), cityStateZip: "Salt Lake City, UT 84121" };
const mortgagee = { name: "Example Mortgage Servicing LLC", address: ["Its Successors and/or Assigns ATIMA", "P.O. Box 000111", "Loan #: 0009876543"].join(NL), cityStateZip: "Springfield, OH 45501" };
const longBank = { name: "First Example National Bank and Trust Company of the Carolinas", address: ["ISAOA / ATIMA", "Attn: Insurance Service Center", "P.O. Box 000222", "Loan Number 00012345678"].join(NL), cityStateZip: "Winston-Salem, NC 27101" };
const signed = { signatureUrl: SIGNATURE };
const sizeOf = (html: string) => /<body class="([a-z]+)">/.exec(html)?.[1] || "unknown";

type Item = { id: string; html: string };

// 1. Named scenarios: open these in a browser to look at the letter.
const scenarios: Record<string, string> = {
  "1-auto-typical": buildPOIDocument(auto, bank, DATE, signed),
  "2-auto-short": buildPOIDocument({ ...auto, coInsured: null, insuredEmail: null, coverages: cov(AUTO, 5), carrier: "National General", policyTypeCode: "" }, noLien, DATE),
  "3-home-heavy": buildPOIDocument(home, mortgagee, DATE, signed),
  "4-extreme": buildPOIDocument({ ...home, coverages: cov(HOME, 27) }, mortgagee, DATE, signed),
  "5-unknown-carrier": buildPOIDocument(
    { ...home, carrier: "Acme Mutual Insurance Company", policyCategory: "other", customPolicyLabel: "General Liability", policyTypeCode: "Commercial General Liability", propertyDescription: "Landscaping contractor", namedInsured: "Testcase & Sons Landscaping <LLC>", coverages: cov(AUTO, 6) },
    noLien,
    DATE,
  ),
  "6-auto-dairyland-lien": buildPOIDocument({ ...auto, carrier: "Dairyland", coverages: cov(AUTO, 8) }, bank, DATE, signed),
};

// 2. Calibration sweep: every coverage count, with and without a lienholder, forced into each size.
const sweep: Item[] = [];
for (const lien of [0, 1]) {
  for (let count = 2; count <= 30; count += 2) {
    const html = buildPOIDocument({ ...auto, vehicleModel: "F-150", coverages: plainRows(count) }, lien ? plainLien : noLien, DATE, signed);
    const chosen = sizeOf(html);
    for (const size of SIZES) {
      sweep.push({ id: `n${count}-lien${lien}-${size}${size === chosen ? "-CHOSEN" : ""}`, html: html.replace(/<body class="[a-z]+">/, `<body class="${size}">`) });
    }
  }
}
for (const [name, html] of Object.entries(scenarios)) sweep.push({ id: `scenario-${name}-${sizeOf(html)}-CHOSEN`, html });

// 3. Stress set: 80 seeded-random letters with real-world shapes (long names, wrapped limits, 1 to 4 lienholder lines).
let seed = 20261116;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const pick = <T,>(list: T[]) => list[Math.floor(rnd() * list.length)];
const NAMES = ["Robin Testcase", "Maria Guadalupe Hernandez-Villanueva", "J. P. Testcase III", "Testcase Family Revocable Living Trust", "Al To"];
const random: Item[] = [];
for (let i = 0; i < 80; i += 1) {
  const isHome = rnd() < 0.4;
  const count = 3 + Math.floor(rnd() * (isHome ? 20 : 14));
  const data = {
    ...(isHome ? home : auto),
    namedInsured: pick(NAMES),
    coInsured: rnd() < 0.5 ? pick(NAMES) : null,
    insuredEmail: rnd() < 0.6 ? "a.very.long.email.address@example-insurance-mail.com" : null,
    coverages: cov(isHome ? HOME : AUTO, count).sort(() => rnd() - 0.5),
    carrier: pick(["Progressive", "Nationwide", "National General", "NC Grange", "Foremost", "Unlisted Carrier Mutual"]),
  };
  const html = buildPOIDocument(data, pick([noLien, noLien, plainLien, bank, mortgagee, longBank]), DATE, rnd() < 0.6 ? signed : {});
  random.push({ id: `random-${i}-n${count}-${sizeOf(html)}`, html });
}

// A page that loads each letter in a frame, waits for the font, and writes "id height fontFaces" lines.
const labPage = (items: Item[]) => {
  const json = JSON.stringify(items).split("<").join(String.fromCharCode(92) + "u003c");
  return `<!doctype html><meta charset="utf-8"><title>POI fit lab</title><pre id="out">PENDING</pre>
<script>
const ITEMS = ${json};
(async () => {
  const NL = String.fromCharCode(10);
  const out = [];
  const frame = document.createElement('iframe');
  frame.style.cssText = 'width:900px;height:1300px;border:0';
  document.body.appendChild(frame);
  for (const item of ITEMS) {
    await new Promise(resolve => { frame.onload = resolve; frame.srcdoc = item.html; });
    const doc = frame.contentDocument;
    try { await doc.fonts.ready; } catch (error) {}
    const sheet = doc.querySelector('.sheet');
    sheet.style.minHeight = '0';
    out.push(item.id + ' ' + Math.round(sheet.getBoundingClientRect().height) + ' ' + [...doc.fonts].filter(face => face.status === 'loaded').length);
  }
  document.getElementById('out').textContent = 'DONE' + NL + out.join(NL);
})();
</script>`;
};

// 4. Contact sheet: every carrier logo in the real title tile.
const style = /<style>[^]*?<\/style>/.exec(scenarios["1-auto-typical"])?.[0] || "";
const tiles = Object.entries(CARRIER_LOGOS)
  .map(([name, url]) => `<div><div class="ctile"><img src="${url}" alt="${name}"></div><small style="font:600 11px Arial">${name}</small></div>`)
  .join("");

mkdirSync(OUT, { recursive: true });
for (const [name, html] of Object.entries(scenarios)) writeFileSync(path.join(OUT, `${name}.html`), html, "utf8");
writeFileSync(path.join(OUT, "lab.html"), labPage(sweep), "utf8");
writeFileSync(path.join(OUT, "lab-random.html"), labPage(random), "utf8");
writeFileSync(path.join(OUT, "logos.html"), `<!doctype html><meta charset="utf-8">${style}<body class="standard" style="background:#fff;padding:16px"><div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px 14px">${tiles}</div></body>`, "utf8");

console.log(`Wrote ${Object.keys(scenarios).length} scenario letters, lab.html (${sweep.length} measurements), lab-random.html (${random.length} letters) and logos.html to:`);
console.log(OUT);
for (const [name, html] of Object.entries(scenarios)) console.log(`  ${name}: ${sizeOf(html)}`);
