import { AGENCY, CARRIER_LOGOS, CARRIER_LOGO_NEEDS_NAME, AGENT_IDS } from "../constants";
import { ParsedPolicyData, Lienholder } from "../types";

const clean = (value: unknown, fallback = "") => {
  if (value == null) return fallback;
  const text = String(value).trim();
  if (!text || text.toLowerCase() === "null" || text.toLowerCase() === "undefined") {
    return fallback;
  }
  return text;
};

const hasValue = (value: unknown) => clean(value) !== "";

// Everything printed on the letter comes from a parsed document or a staff field,
// so it is escaped before it goes into the page. Entities already in the text are kept.
const esc = (value: string) =>
  value
    .replace(/&(?!(?:[a-zA-Z][a-zA-Z0-9]*|#\d+|#x[0-9a-fA-F]+);)/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Escaped text, or a trusted HTML fallback when the value is blank. */
const text = (value: unknown, fallbackHtml = "") => {
  const raw = clean(value);
  return raw ? esc(raw) : fallbackHtml;
};

const stacked = (parts: string[]) => parts.map((part) => esc(part)).join("<br/>");

const formatLine = (...parts: Array<unknown>) => parts.map((part) => clean(part)).filter(Boolean).join(" ");

const formatCityStateZip = (city: unknown, state: unknown, zip: unknown) => {
  const cityText = clean(city);
  const stateText = clean(state);
  const zipText = clean(zip);
  if (!cityText && !stateText && !zipText) return "";
  return [cityText, [stateText, zipText].filter(Boolean).join(" ")].filter(Boolean).join(", ");
};

const inferPolicyCategory = (data: ParsedPolicyData) => {
  const explicit = clean(data.policyCategory).toLowerCase();
  if (explicit) return explicit;

  const policyTypeCode = clean(data.policyTypeCode).toLowerCase();
  if (/(^|\b)(ho|dp|mh|condo|renters|dwelling|landlord)(\b|$)/.test(policyTypeCode)) {
    return "home";
  }

  const coverageNames = (data.coverages || [])
    .map((coverage) => clean(coverage.name).toLowerCase())
    .join(" | ");

  if (/(cov a|cov b|cov c|cov d|dwelling|other structures|personal property|loss of use|inland flood|equipment breakdown|refrigerated property)/.test(coverageNames)) {
    return "home";
  }

  if (hasValue(data.vehicleVIN) || hasValue(data.vehicleYear) || hasValue(data.vehicleMake) || hasValue(data.vehicleModel) || hasValue(data.vehicleType)) {
    return "auto";
  }

  return "other";
};

const formatCategoryLabel = (value: string) =>
  value
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const pickCarrierLogo = (carrier: string) => {
  let carrierLogoUrl = CARRIER_LOGOS[carrier || ""] || "";

  if (!carrierLogoUrl && carrier) {
    const key = Object.keys(CARRIER_LOGOS).find((candidate) =>
      carrier.toLowerCase().includes(candidate.toLowerCase()),
    );
    if (key) {
      carrierLogoUrl = CARRIER_LOGOS[key];
    }
  }

  return carrierLogoUrl;
};

const pickAgentId = (carrier: string) => {
  let agentIdValue = AGENT_IDS[carrier || ""];

  if (!agentIdValue && carrier) {
    const key = Object.keys(AGENT_IDS).find((candidate) =>
      carrier.toLowerCase().includes(candidate.toLowerCase()),
    );
    if (key) {
      agentIdValue = AGENT_IDS[key];
    }
  }

  return agentIdValue
    ? `Agent #${agentIdValue} - ${carrier || ""} Authorized`
    : "Licensed Independent Agent";
};

type DetailRow = { label: string; lines: string[] };

const detailRow = (label: string, ...parts: string[]): DetailRow => ({ label, lines: parts.filter(Boolean) });

const buildRiskDetails = (data: ParsedPolicyData, policyCategory: string) => {
  const customPolicyLabel = clean(data.customPolicyLabel);
  const propertyAddress = clean(data.propertyAddress) || clean(data.insuredAddress);
  const propertyCityStateZip =
    formatCityStateZip(data.propertyCity, data.propertyState, data.propertyZip) ||
    formatCityStateZip(data.insuredCity, data.insuredState, data.insuredZip);
  const vehicleDetail = data.vehicleLength
    ? `${clean(data.vehicleType)} / ${clean(data.vehicleLength)} ft.`
    : clean(data.vehicleType);

  if (policyCategory === "home") {
    return {
      header: "Insured Property / Collateral",
      subjectSuffix: customPolicyLabel || clean(data.policyTypeCode) || clean(data.propertyDescription) || "Property Policy",
      bodyNoun: "property",
      rows: [
        detailRow("Property", clean(data.propertyDescription, clean(data.policyTypeCode, "Residential Property"))),
        detailRow("Premises", propertyAddress, propertyCityStateZip),
        detailRow("Construction", clean(data.constructionType)),
        detailRow("Occupancy", clean(data.occupancyType)),
        detailRow("Year Built", clean(data.yearBuilt)),
        detailRow("Policy Form", clean(data.policyTypeCode)),
      ].filter((row) => row.lines.length > 0),
    };
  }

  if (policyCategory === "auto") {
    return {
      header: "Insured Vehicle / Collateral",
      subjectSuffix: customPolicyLabel || clean(data.vehicleType, clean(data.policyTypeCode, "Auto Policy")),
      bodyNoun: "vehicle",
      rows: [
        detailRow("Vehicle", formatLine(data.vehicleYear, data.vehicleMake, data.vehicleModel)),
        detailRow("VIN", clean(data.vehicleVIN)),
        detailRow("Type", vehicleDetail),
        detailRow("Garaging", formatCityStateZip(data.garagingZip, data.garagingState, "")),
        detailRow("Use", clean(data.vehicleUse)),
        detailRow("ACV Rating Base", clean(data.ratingBase)),
      ].filter((row) => row.lines.length > 0),
    };
  }

  return {
    header: "Insured Risk / Collateral",
    subjectSuffix: customPolicyLabel || clean(data.policyTypeCode, formatCategoryLabel(policyCategory) || "Policy"),
    bodyNoun: customPolicyLabel ? customPolicyLabel.toLowerCase() : "insured risk",
    rows: [
      detailRow("Type", customPolicyLabel || clean(data.policyTypeCode, clean(data.vehicleType, clean(data.propertyDescription, formatCategoryLabel(policyCategory) || "Policy")))),
      detailRow(
        "Location",
        propertyAddress || clean(data.insuredAddress),
        propertyCityStateZip || formatCityStateZip(data.insuredCity, data.insuredState, data.insuredZip),
      ),
      detailRow("Description", clean(data.propertyDescription, formatLine(data.vehicleYear, data.vehicleMake, data.vehicleModel))),
    ].filter((row) => row.lines.length > 0),
  };
};

const renderDetailRows = (rows: DetailRow[]) =>
  rows.map((row) => `<tr><td class="k">${esc(row.label)}</td><td class="v">${stacked(row.lines)}</td></tr>`).join("");

// ---------------------------------------------------------------------------
// Built to print on one US Letter page. The letter has six sizes; the builder estimates
// the printed height of each and uses the roomiest one that fits, so a short
// proof prints open and a long home policy with a mortgagee still fits.
//
// The numbers are pixels at 96 dpi, measured in Chrome with the Outfit font:
//   fs / lh  body font size and line height (must match the CSS below)
//   base     an unsigned letter with six one-line detail rows, a four-line address
//            block, no coverage rows and no lienholder
//   row      one extra one-line table row
//   lien     the lienholder card with a one-line address and a two-line note
// ---------------------------------------------------------------------------
type Density = { name: string; fs: number; lh: number; base: number; row: number; lien: number };

const DENSITIES: Density[] = [
  { name: "roomy", fs: 13.2, lh: 1.34, base: 865, row: 25.7, lien: 132 },
  { name: "standard", fs: 12.4, lh: 1.3, base: 767, row: 22.3, lien: 114 },
  { name: "medium", fs: 11.93, lh: 1.27, base: 713, row: 20.6, lien: 106 },
  { name: "compact", fs: 11.47, lh: 1.24, base: 662, row: 19, lien: 97 },
  { name: "snug", fs: 11.07, lh: 1.21, base: 614, row: 17.2, lien: 88 },
  { name: "tight", fs: 10.67, lh: 1.18, base: 568, row: 15.4, lien: 79 },
];

const PAGE_HEIGHT = 1056;
const SAFETY = 14;
const SIGNATURE_EXTRA = 18;

/** Width of a string in the Outfit font, from widths measured per kind of character (in em). */
const textWidth = (value: string, fs: number, bold = false) => {
  let em = 0;
  for (const char of value) {
    if (char === " ") em += 0.2;
    else if (/[a-z]/.test(char)) em += bold ? 0.53 : 0.51;
    else if (/[A-Z]/.test(char)) em += bold ? 0.67 : 0.65;
    else if (/[0-9]/.test(char)) em += bold ? 0.55 : 0.535;
    else em += 0.45;
  }
  return em * fs;
};

/** Printed lines a value needs in a column `px` wide. Words break unevenly, so wrapped text is counted generously. */
const wrapLines = (value: string, px: number, fs: number, bold = false) => {
  const width = textWidth(value, fs, bold);
  return width <= px ? 1 : Math.max(2, Math.ceil((width * 1.08) / px));
};

type LetterShape = {
  coverages: Array<{ name: string; limit: string; deductible: string }>;
  detailCards: DetailRow[][];
  /** The two address cards: a heading name (printed in capitals) and the lines under it. */
  addressCards: Array<{ name: string; lines: string[] }>;
  subject: string;
  intro: string;
  lienholder: { name: string; address: string } | null;
  signed: boolean;
};

const estimateHeight = (density: Density, shape: LetterShape) => {
  const line = density.fs * density.lh;
  const coveragePx = shape.coverages.reduce((total, coverage) => {
    const printed = Math.max(
      wrapLines(coverage.name, 245, density.fs, true),
      wrapLines(coverage.limit, 216, density.fs),
      wrapLines(coverage.deductible, 101, density.fs),
    );
    return total + density.row + (printed - 1) * line;
  }, 0);
  const cardPx = (rows: DetailRow[]) =>
    rows.reduce((total, row) => {
      const printed = row.lines.reduce((sum, value) => sum + wrapLines(value, 198, density.fs, true), 0);
      return total + density.row + (Math.max(1, printed) - 1) * line;
    }, 0);
  const detailPx = Math.max(...shape.detailCards.map(cardPx)) - 6 * density.row;
  // Long names wrap: in the address cards, the subject bar and the opening sentence.
  const addressCardLines = (card: { name: string; lines: string[] }) =>
    wrapLines(card.name.toUpperCase(), 326, density.fs * 1.08, true) +
    card.lines.reduce((sum, value) => sum + wrapLines(value, 326, density.fs), 0);
  const addressPx = (Math.max(...shape.addressCards.map(addressCardLines)) - 4) * line;
  const subjectPx = (wrapLines(shape.subject, 690, density.fs * 1.04, true) - 1) * line * 1.04;
  const introPx = (wrapLines(shape.intro, 718, density.fs * 1.02) - 2) * line * 1.02;
  let lienPx = 0;
  if (shape.lienholder) {
    const noteChars = 172 + shape.lienholder.name.length;
    lienPx =
      density.lien +
      (wrapLines(shape.lienholder.name, 214, density.fs, true) - 1) * line +
      (wrapLines(shape.lienholder.address, 575, density.fs, true) - 1) * line +
      Math.max(0, wrapLines("x".repeat(noteChars), 697, density.fs * 0.9) - 2) * line * 0.9;
  }
  return (
    density.base + coveragePx + detailPx + addressPx + subjectPx + introPx + lienPx + (shape.signed ? SIGNATURE_EXTRA : 0)
  );
};

const pickDensity = (shape: LetterShape) => {
  const fitting = DENSITIES.find((density) => estimateHeight(density, shape) <= PAGE_HEIGHT - SAFETY);
  // Nothing fits only for an unusually long policy; the tightest size then runs onto a second page rather than cut anything off.
  return { name: (fitting || DENSITIES[DENSITIES.length - 1]).name, onePage: Boolean(fitting) };
};

type POIDocumentOptions = {
  signatureUrl?: string;
};

export function buildPOIDocument(
  data: ParsedPolicyData,
  lienholder: Lienholder,
  docDate: string,
  options: POIDocumentOptions = {},
): string {
  if (!data) return "";

  const carrier = clean(data.carrier);
  const carrierLogoUrl = pickCarrierLogo(carrier);
  const agentId = pickAgentId(carrier);
  const policyCategory = inferPolicyCategory(data);
  const riskDetails = buildRiskDetails(data, policyCategory);
  const coverages = data.coverages || [];
  const lienholderName = clean(lienholder?.name);
  const lienholderLines = [
    ...clean(lienholder?.address).split(/\r?\n/).map((line) => line.trim()),
    clean(lienholder?.cityStateZip),
  ].filter(Boolean);
  const policyNumber = clean(data.policyNumber, "Pending");
  const insuredName = clean(data.namedInsured, "Insured");
  const insuredLines = [clean(data.insuredAddress), formatCityStateZip(data.insuredCity, data.insuredState, data.insuredZip)].filter(Boolean);
  const insuredEmail = clean(data.insuredEmail);
  const policyPeriod = [clean(data.policyPeriodStart), clean(data.policyPeriodEnd)].filter(Boolean).join(" - ");
  const signatureUrl = clean(options.signatureUrl);
  const dash = "&mdash;";

  const policyRows: DetailRow[] = [
    detailRow("Policy #", policyNumber),
    detailRow("Period", policyPeriod),
    detailRow("Named Insured", insuredName),
    detailRow("Co-Insured", clean(data.coInsured)),
    detailRow("Company", carrier),
    detailRow("Policy Type", clean(data.policyTypeCode)),
  ].filter((row) => row.lines.length > 0);

  const coverageRows = coverages
    .map(
      (coverage) => `
        <tr>
          <td>${text(coverage.name, dash)}</td>
          <td>${text(coverage.limit, dash)}</td>
          <td>${text(coverage.deductible, dash)}</td>
          <td class="r">${text(coverage.premium, dash)}</td>
        </tr>`,
    )
    .join("");

  const density = pickDensity({
    coverages: coverages.map((coverage) => ({
      name: clean(coverage.name),
      limit: clean(coverage.limit),
      deductible: clean(coverage.deductible),
    })),
    detailCards: [policyRows, riskDetails.rows],
    addressCards: [
      { name: lienholderName || "To Whom It May Concern", lines: lienholderName ? lienholderLines : [] },
      { name: insuredName, lines: insuredEmail ? [...insuredLines, insuredEmail] : insuredLines },
    ],
    subject: `RE: Verification of Active Insurance Coverage - ${riskDetails.subjectSuffix}`,
    intro: `This letter confirms that ${insuredName} carries active insurance through ${carrier} on the ${riskDetails.bodyNoun} described below. This policy is currently in force and in good standing as of the date of this letter.`,
    lienholder: lienholderName ? { name: lienholderName, address: lienholderLines.join(" · ") } : null,
    signed: Boolean(signatureUrl),
  });

  const logoNeedsName = CARRIER_LOGO_NEEDS_NAME.some((name) => carrier.toLowerCase().includes(name.toLowerCase()));
  const carrierTile = carrierLogoUrl
    ? `<div class="ctile${logoNeedsName ? " mark" : ""}"><img src="${esc(carrierLogoUrl)}" alt="${esc(carrier)}" onerror="var b=document.createElement('b');b.textContent=this.alt;this.replaceWith(b)" />${logoNeedsName ? `<b>${esc(carrier)}</b>` : ""}</div>`
    : carrier
      ? `<div class="ctile"><b>${esc(carrier)}</b></div>`
      : "";

  const lienholderBlock = lienholderName
    ? `
  <div class="card lien">
    <div class="head">&#9733; Lienholder / Loss Payee on File</div>
    <table class="kv k4">
      <tr>
        <td class="k">Lienholder Name</td>
        <td class="v">${esc(lienholderName)}</td>
        <td class="k">Interest</td>
        <td class="v">Loss Payee / Lienholder</td>
      </tr>
      <tr>
        <td class="k">Address</td>
        <td class="v" colspan="3">${lienholderLines.map((line) => esc(line)).join(" &middot; ") || dash}</td>
      </tr>
    </table>
    <p class="lien-note">
      ${esc(lienholderName)} is recorded as Loss Payee. In the event of a covered total or partial loss,
      settlement proceeds will be issued jointly or as directed in accordance with their financial interest.
    </p>
  </div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Verification of Insurance - ${esc(insuredName)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800;900&display=swap">
<style>
  /* Bill Layne Insurance - Proof of Insurance letter, Speedee print look. One US Letter page. */
  @page { size: letter; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html { background: #EEF2F6; }
  body {
    --fs: 9.3pt; --lh: 1.3; --row: 2.6px; --gap: 9px; --pad: 7px; --h1: 20pt; --logo: 44px; --sig: 38px;
    font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    font-size: var(--fs); line-height: var(--lh); color: #334155; background: #EEF2F6;
    font-variant-numeric: tabular-nums; -webkit-font-smoothing: antialiased;
  }
  body.roomy { --fs: 9.9pt; --lh: 1.34; --row: 3.5px; --gap: 12px; --pad: 9px; --h1: 22pt; --logo: 48px; --sig: 40px; }
  body.medium { --fs: 8.95pt; --lh: 1.27; --row: 2.2px; --gap: 7.5px; --pad: 6px; --h1: 18.75pt; --logo: 41px; --sig: 36px; }
  body.compact { --fs: 8.6pt; --lh: 1.24; --row: 1.9px; --gap: 6px; --pad: 5px; --h1: 17.5pt; --logo: 38px; --sig: 34px; }
  body.snug { --fs: 8.3pt; --lh: 1.21; --row: 1.4px; --gap: 5px; --pad: 4px; --h1: 16pt; --logo: 35px; --sig: 32px; }
  body.tight { --fs: 8pt; --lh: 1.18; --row: 0.9px; --gap: 4px; --pad: 3px; --h1: 15pt; --logo: 32px; --sig: 30px; }
  .sheet {
    width: 8.5in; min-height: 11in; margin: 18px auto; padding: 0.34in 0.5in 0.26in;
    background: #fff; display: flex; flex-direction: column; box-shadow: 0 10px 28px rgba(10, 31, 68, 0.10);
  }
  .hdr { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding-bottom: var(--gap); border-bottom: 2px solid #0A1F44; }
  .hdr img { height: var(--logo); width: auto; display: block; }
  .hdr-r { text-align: right; line-height: 1.3; font-size: 0.94em; font-weight: 500; color: #5B667A; }
  .hdr-r b { display: block; font-size: 1.3em; font-weight: 800; color: #0A1F44; }
  .hero { display: flex; align-items: center; justify-content: space-between; gap: 18px; margin-top: var(--gap); }
  .pill { display: inline-block; padding: 1px 11px; border-radius: 999px; background: #FFC72C; color: #0A1F44; font-size: 0.8em; font-weight: 800; letter-spacing: 0.07em; text-transform: uppercase; line-height: 1.5; }
  h1 { margin-top: 3px; font-size: var(--h1); font-weight: 900; letter-spacing: -0.02em; line-height: 1.08; color: #0A1F44; }
  .hero-meta { margin-top: 2px; font-size: 1.03em; font-weight: 500; color: #334155; }
  .hero-meta b { font-weight: 800; color: #0A1F44; }
  .ctile { flex: none; display: flex; align-items: center; justify-content: center; min-width: 1.7in; max-width: 2.3in; height: calc(var(--logo) + 16px); padding: 7px 14px; border: 1.5px solid #D5DFEC; border-radius: 14px; background: #fff; }
  .ctile img { max-width: 100%; max-height: 100%; object-fit: contain; display: block; }
  .ctile b { font-size: 1.2em; font-weight: 800; line-height: 1.2; text-align: center; color: #0A1F44; }
  .ctile.mark { gap: 10px; }
  .ctile.mark img { max-width: 34%; }
  .ctile.mark b { text-align: left; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: var(--gap); }
  .card { border: 1.5px solid #D5DFEC; border-radius: 12px; background: #fff; overflow: hidden; break-inside: avoid; page-break-inside: avoid; }
  .card.soft { padding: var(--pad) 12px; background: #F8FAFC; }
  .lab { display: block; font-size: 0.8em; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: #5B667A; }
  .name { display: block; font-size: 1.08em; font-weight: 800; color: #0A1F44; }
  .card.soft .em { font-size: 0.94em; color: #5B667A; }
  .card.soft .none { font-style: italic; color: #5B667A; }
  .re { margin-top: var(--gap); padding: calc(var(--row) + 2px) 12px; border-left: 4px solid #003F87; border-radius: 0 10px 10px 0; background: #EAF4FC; font-size: 1.04em; font-weight: 800; color: #0A1F44; }
  .txt { margin-top: var(--gap); font-size: 1.02em; }
  .txt strong { font-weight: 800; color: #0A1F44; }
  .head { padding: calc(var(--row) + 1.5px) 10px; border-bottom: 1px solid #D5E4F3; background: #EAF4FC; font-size: 0.84em; font-weight: 800; letter-spacing: 0.07em; text-transform: uppercase; text-align: left; color: #0A1F44; }
  table { width: 100%; border-collapse: collapse; }
  .kv td { padding: var(--row) 10px; vertical-align: top; border-bottom: 1px solid #E8EEF5; }
  .kv tr:last-child td { border-bottom: 0; }
  .kv .k { width: 38%; padding-right: 4px; font-weight: 600; color: #5B667A; }
  .kv .v { font-weight: 700; color: #0A1F44; overflow-wrap: anywhere; }
  .kv.k4 .k { width: 17%; }
  .kv.k4 .v { width: 33%; }
  h2 { margin-top: var(--gap); font-size: 1.22em; font-weight: 900; letter-spacing: -0.01em; line-height: 1.2; color: #0A1F44; }
  .cov-card { margin-top: calc(var(--gap) * 0.5); }
  .cov td { padding: var(--row) 10px; vertical-align: top; border-bottom: 1px solid #E8EEF5; }
  .cov td:first-child { font-weight: 700; color: #0A1F44; }
  .cov .r { text-align: right; white-space: nowrap; }
  .cov tr.total td { border-top: 1.5px solid #E5B022; border-bottom: 0; background: #FFF6D6; font-weight: 800; color: #0A1F44; }
  .card.lien { margin-top: var(--gap); border-color: #E5B022; }
  .card.lien .head { border-bottom-color: #F0DC9A; background: #FFF6D6; color: #7A5200; }
  .lien-note { padding: var(--row) 10px calc(var(--row) + 2px); border-top: 1px solid #E8EEF5; font-size: 0.9em; color: #5B667A; }
  .sig { display: grid; grid-template-columns: 1.3fr 0.7fr; gap: 44px; margin-top: var(--gap); break-inside: avoid; page-break-inside: avoid; }
  .sig-stack { min-height: var(--sig); display: flex; flex-direction: column; justify-content: flex-end; }
  .signature-image { height: 46px; width: auto; align-self: flex-start; display: block; margin: 0 0 -12px 10px; position: relative; z-index: 1; }
  .signed .sig-line { padding-top: 11px; }
  .sig-date { padding: 0 2px 2px; font-size: 1.06em; font-weight: 700; color: #0A1F44; }
  .sig-line { padding-top: 2px; border-top: 1.5px solid #0A1F44; font-size: 0.8em; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: #5B667A; }
  .sig-name { margin-top: 2px; font-size: 1.06em; font-weight: 800; color: #0A1F44; }
  .sig-name span { font-size: 0.9em; font-weight: 500; color: #5B667A; }
  .sig-sub { font-size: 0.94em; color: #5B667A; }
  .foot { margin-top: auto; padding-top: var(--gap); }
  .foot-in { display: flex; align-items: flex-end; justify-content: space-between; gap: 18px; padding-top: 6px; border-top: 1px solid #DCE3EE; font-size: 0.84em; line-height: 1.35; color: #5B667A; }
  .foot-in b { font-weight: 800; color: #0A1F44; }
  .foot-r { flex: none; text-align: right; }
  .tag { display: block; font-size: 0.92em; font-weight: 800; letter-spacing: 0.07em; text-transform: uppercase; color: #9A6700; }
  @media print {
    html, body { background: #fff; }
    .sheet { margin: 0; box-shadow: none; }
  }
</style>
</head>
<body class="${density.name}">
<div class="sheet">

  <div class="hdr">
    <img src="${esc(AGENCY.logo)}" alt="${esc(AGENCY.name)}" />
    <div class="hdr-r">
      <b>${esc(AGENCY.phone)}</b>
      ${esc(AGENCY.address)}, ${esc(AGENCY.city)} &nbsp;&middot;&nbsp; ${esc(AGENCY.website)}
    </div>
  </div>

  <div class="hero">
    <div>
      <span class="pill">Proof of Insurance</span>
      <h1>Verification of Insurance</h1>
      <p class="hero-meta">Policy No. <b>${esc(policyNumber)}</b> &nbsp;&middot;&nbsp; Date: <b>${esc(docDate)}</b></p>
    </div>
    ${carrierTile}
  </div>

  <div class="two">
    <div class="card soft">
      <span class="lab">${lienholderName ? "To / Lienholder" : "To"}</span>
      ${
        lienholderName
          ? `<span class="name">${esc(lienholderName.toUpperCase())}</span>
      <p>${stacked(lienholderLines)}</p>`
          : `<span class="name">To Whom It May Concern</span>`
      }
    </div>
    <div class="card soft">
      <span class="lab">Insured</span>
      <span class="name">${esc(insuredName.toUpperCase())}</span>
      <p>${stacked(insuredLines)}</p>
      ${insuredEmail ? `<p class="em">${esc(insuredEmail)}</p>` : ""}
    </div>
  </div>

  <p class="re">RE: Verification of Active Insurance Coverage - ${esc(riskDetails.subjectSuffix)}</p>

  <p class="txt">
    This letter confirms that <strong>${esc(insuredName)}</strong> carries active insurance through
    <strong>${esc(carrier)}</strong> on the ${esc(riskDetails.bodyNoun)} described below.
    This policy is currently in force and in good standing as of the date of this letter.
  </p>

  <div class="two">
    <div class="card">
      <div class="head">Policy Information</div>
      <table class="kv">${renderDetailRows(policyRows)}</table>
    </div>
    <div class="card">
      <div class="head">${esc(riskDetails.header)}</div>
      <table class="kv">${renderDetailRows(riskDetails.rows)}</table>
    </div>
  </div>

  <h2>Coverage in Force</h2>
  <div class="card cov-card">
    <table class="cov">
      <thead>
        <tr>
          <th class="head" style="width:37%;">Coverage</th>
          <th class="head" style="width:33%;">Limit</th>
          <th class="head" style="width:17%;">Deductible</th>
          <th class="head" style="width:13%; text-align:right;">Premium</th>
        </tr>
      </thead>
      <tbody>${coverageRows}
        <tr class="total">
          <td colspan="3">Total Annual Premium</td>
          <td class="r">${text(data.totalAnnualPremium, dash)}</td>
        </tr>
      </tbody>
    </table>
  </div>
${lienholderBlock}

  <p class="txt">
    For questions or additional documentation, please contact our office at <strong>${esc(AGENCY.phone)}</strong>.
  </p>

  <div class="sig">
    <div>
      <div class="sig-stack${signatureUrl ? " signed" : ""}">
        ${signatureUrl ? `<img class="signature-image" src="${esc(signatureUrl)}" alt="${esc(AGENCY.agentName)} signature" />` : ""}
        <div class="sig-line">Authorized Agent Signature</div>
      </div>
      <div class="sig-name">${esc(AGENCY.agentName)} <span>&middot; ${esc(AGENCY.name)}</span></div>
      <div class="sig-sub">${esc(agentId)}</div>
    </div>
    <div>
      <div class="sig-stack">
        <div class="sig-date">${esc(docDate)}</div>
        <div class="sig-line">Date</div>
      </div>
    </div>
  </div>

  <div class="foot">
    <div class="foot-in">
      <div>
        <b>${esc(AGENCY.name)}</b> &middot; ${esc(AGENCY.license)} &middot; ${esc(AGENCY.email)}<br/>
        This document is for verification purposes only and does not alter, amend, or extend the policy.
      </div>
      <div class="foot-r">
        <span class="tag">${esc(AGENCY.tagline)}</span>
        ${density.onePage ? "Page 1 of 1" : ""}
      </div>
    </div>
  </div>

</div>
</body>
</html>`;
}
