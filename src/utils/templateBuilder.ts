import { AGENCY, CARRIER_LOGOS, AGENT_IDS } from "../constants";
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

const buildCoverageRows = (coverages: ParsedPolicyData["coverages"]) =>
  (coverages || [])
    .map(
      (coverage) => `
    <tr>
      <td>${clean(coverage.name, "&mdash;")}</td>
      <td>${clean(coverage.limit, "&mdash;")}</td>
      <td>${clean(coverage.deductible, "&mdash;")}</td>
      <td>${clean(coverage.premium, "&mdash;")}</td>
    </tr>
  `,
    )
    .join("");

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
        ["Property:", clean(data.propertyDescription, clean(data.policyTypeCode, "Residential Property"))],
        ["Premises:", [propertyAddress, propertyCityStateZip].filter(Boolean).join("<br/>")],
        ["Construction:", clean(data.constructionType)],
        ["Occupancy:", clean(data.occupancyType)],
        ["Year Built:", clean(data.yearBuilt)],
        ["Policy Form:", clean(data.policyTypeCode)],
      ].filter(([, value]) => Boolean(value)),
    };
  }

  if (policyCategory === "auto") {
    return {
      header: "Insured Vehicle / Collateral",
      subjectSuffix: customPolicyLabel || clean(data.vehicleType, clean(data.policyTypeCode, "Auto Policy")),
      bodyNoun: "vehicle",
      rows: [
        ["Vehicle:", formatLine(data.vehicleYear, data.vehicleMake, data.vehicleModel)],
        ["VIN:", clean(data.vehicleVIN)],
        ["Type:", vehicleDetail],
        ["Garaging:", formatCityStateZip(data.garagingZip, data.garagingState, "")],
        ["Use:", clean(data.vehicleUse)],
        ["ACV Rating Base:", clean(data.ratingBase)],
      ].filter(([, value]) => Boolean(value)),
    };
  }

  return {
    header: "Insured Risk / Collateral",
    subjectSuffix: customPolicyLabel || clean(data.policyTypeCode, formatCategoryLabel(policyCategory) || "Policy"),
    bodyNoun: customPolicyLabel ? customPolicyLabel.toLowerCase() : "insured risk",
    rows: [
      ["Type:", customPolicyLabel || clean(data.policyTypeCode, clean(data.vehicleType, clean(data.propertyDescription, formatCategoryLabel(policyCategory) || "Policy")))],
      ["Location:", [propertyAddress || clean(data.insuredAddress), propertyCityStateZip || formatCityStateZip(data.insuredCity, data.insuredState, data.insuredZip)].filter(Boolean).join("<br/>")],
      ["Description:", clean(data.propertyDescription, formatLine(data.vehicleYear, data.vehicleMake, data.vehicleModel))],
    ].filter(([, value]) => Boolean(value)),
  };
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
  const coverageRows = buildCoverageRows(data.coverages);
  const lienholderName = clean(lienholder?.name);
  const lienholderAddress = clean(lienholder?.address).replace(/\n/g, "<br/>");
  const lienholderCityStateZip = clean(lienholder?.cityStateZip);
  const policyNumber = clean(data.policyNumber, "Pending");
  const formattedAddress = lienholderAddress;
  const insuredName = clean(data.namedInsured, "Insured");
  const insuredAddress = clean(data.insuredAddress);
  const insuredCityStateZip = formatCityStateZip(data.insuredCity, data.insuredState, data.insuredZip);
  const policyPeriod = [clean(data.policyPeriodStart), clean(data.policyPeriodEnd)].filter(Boolean).join(" - ");
  const totalAnnualPremium = clean(data.totalAnnualPremium, "&mdash;");
  const signatureUrl = clean(options.signatureUrl);
  const signatureImage = signatureUrl
    ? `<img class="signature-image" src="${signatureUrl}" alt="${AGENCY.agentName} signature" />`
    : "";

  const lienholderBlock = lienholderName
    ? `
    <div class="lien-box">
      <div class="lien-box-header">&#9733; Lienholder / Loss Payee on File</div>
      <div class="lien-box-body">
        <table class="lien-grid">
          <tr>
            <td class="lbl" style="width:18%;">Lienholder Name:</td>
            <td style="width:40%;"><strong>${lienholderName}</strong></td>
            <td class="lbl" style="width:15%;">Interest:</td>
            <td style="width:27%;">Loss Payee / Lienholder</td>
          </tr>
          <tr>
            <td class="lbl">Address:</td>
            <td colspan="3">
              ${formattedAddress}<br/>
              ${lienholderCityStateZip}
            </td>
          </tr>
        </table>
        <p style="font-size:8pt; margin-top:4px; color:#555;">
          ${lienholderName} is recorded as Loss Payee. In the event of a covered total or partial loss,
          settlement proceeds will be issued jointly or as directed in accordance with their financial interest.
        </p>
      </div>
    </div>
  `
    : "";

  const riskRows = riskDetails.rows
    .map(
      ([label, value]) => `<tr><td class="lbl">${label}</td><td>${value}</td></tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Verification of Insurance - ${insuredName}</title>
<style>
  @page { size: letter; margin: 0; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 9pt;
    line-height: 1.2;
    color: #000;
    background: #fff;
    padding: 0.25in 0.5in 0.2in 0.5in;
    width: 8.5in;
    height: 11in;
    overflow: hidden;
  }
  @media print {
    body {
      width: 8.5in;
      height: 11in;
      overflow: hidden !important;
      page-break-after: avoid;
      page-break-before: avoid;
    }
  }
  .header-table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  .carrier-logo img { height: 40px; }
  .doc-info-box { border: 2px solid #003d7a; padding: 4px 8px; text-align: right; background: #f4f7fb; }
  .doc-info-box .doc-title { font-size: 11pt; font-weight: bold; color: #003d7a; }
  .doc-info-box .doc-sub { font-size: 8.5pt; color: #333; margin-top: 2px; }
  .divider { border: none; border-top: 2.5px solid #003d7a; margin: 0 0 8px 0; }
  .addr-table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  .addr-label { font-size: 7pt; font-weight: bold; color: #666; text-transform: uppercase; }
  .addr-name { font-weight: bold; font-size: 9.5pt; }
  .addr-line { font-size: 9pt; }
  .subject-bar { background: #003d7a; color: #fff; padding: 4px 8px; font-size: 9.5pt; font-weight: bold; margin-bottom: 6px; }
  .body-text { font-size: 9.5pt; margin-bottom: 4px; line-height: 1.3; }
  .two-col { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
  .policy-box { border: 1.5px solid #003d7a; border-radius: 3px; margin-bottom: 0; overflow: hidden; }
  .policy-box-header { background: #003d7a; color: #fff; font-weight: bold; font-size: 8.5pt; padding: 3px 8px; text-transform: uppercase; }
  .policy-box-body { padding: 4px 8px; }
  .policy-grid { width: 100%; border-collapse: collapse; }
  .policy-grid td { padding: 1px 4px 1px 0; font-size: 9pt; vertical-align: top; }
  .policy-grid .lbl { font-weight: bold; width: 42%; color: #003d7a; }
  .cov-table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
  .cov-table th { background: #003d7a; color: #fff; font-size: 8.5pt; padding: 3px 6px; text-align: left; }
  .cov-table td { font-size: 8.5pt; padding: 2px 6px; border-bottom: 1px solid #dde3ed; }
  .cov-table tr:last-child td { border-bottom: none; }
  .cov-table tr:nth-child(even) td { background: #f6f8fb; }
  .cov-table tr.total-row td { font-weight: bold; background: #e8eef7; }
  .lien-box { border: 2px solid #c8941a; border-radius: 3px; margin-bottom: 6px; overflow: hidden; }
  .lien-box-header { background: #c8941a; color: #fff; font-weight: bold; font-size: 8.5pt; padding: 3px 8px; text-transform: uppercase; }
  .lien-box-body { padding: 4px 8px; }
  .lien-grid { width: 100%; border-collapse: collapse; }
  .lien-grid td { padding: 1px 4px 1px 0; font-size: 9pt; vertical-align: top; }
  .lien-grid .lbl { font-weight: bold; width: 42%; color: #8a6000; }
  .sig-table { width: 100%; border-collapse: collapse; margin-top: 8px; margin-bottom: 6px; }
  .signature-stack { min-height: 42px; display: flex; flex-direction: column; justify-content: flex-end; }
  .signature-image { width: 150px; max-height: 38px; object-fit: contain; display: block; margin: 0 0 -13px 13px; position: relative; z-index: 1; }
  .sig-line { border-top: 1.5px solid #000; padding-top: 2px; margin-top: 12px; font-size: 8pt; }
  .footer { border-top: 2px solid #003d7a; padding-top: 4px; margin-top: 6px; }
  .footer-table { width: 100%; border-collapse: collapse; }
  .footer-info { text-align: right; font-size: 7.5pt; color: #333; line-height: 1.35; }
  .footer-tagline { font-style: italic; font-size: 7pt; color: #003d7a; }
  .page-note { text-align: center; font-size: 7pt; color: #777; margin-top: 3px; }
</style>
</head>
<body>

<table class="header-table">
  <tr>
    <td class="carrier-logo">
      <img src="${carrierLogoUrl}" alt="${carrier}" onerror="this.style.display='none'" />
      <span style="font-size:11pt; font-weight:bold; color:#003d7a;">${carrierLogoUrl ? "" : carrier}</span>
    </td>
    <td style="width:55%; text-align:right;">
      <div class="doc-info-box">
        <div class="doc-title">VERIFICATION OF INSURANCE</div>
        <div class="doc-sub">Policy No: <strong>${policyNumber}</strong> &nbsp;|&nbsp; Date: ${docDate}</div>
        <div class="doc-sub">${carrier}</div>
      </div>
    </td>
  </tr>
</table>

<hr class="divider" />

<table class="addr-table">
  <tr>
    <td style="width:48%; padding-right:20px; vertical-align:top;">
      <div class="addr-label">To / Lienholder:</div>
      ${
        lienholderName
          ? `
        <div class="addr-name">${lienholderName.toUpperCase()}</div>
        <div class="addr-line">${formattedAddress}</div>
        <div class="addr-line">${lienholderCityStateZip}</div>
      `
          : `<div class="addr-line" style="color:#666; font-style:italic;">See lienholder section below</div>`
      }
    </td>
    <td style="width:52%; vertical-align:top;">
      <div class="addr-label">Insured:</div>
      <div class="addr-name">${insuredName.toUpperCase()}</div>
      <div class="addr-line">${insuredAddress}</div>
      <div class="addr-line">${insuredCityStateZip}</div>
      ${
        hasValue(data.insuredEmail)
          ? `<div class="addr-line" style="margin-top:3px; color:#444; font-size:8.5pt;">${clean(data.insuredEmail)}</div>`
          : ""
      }
    </td>
  </tr>
</table>

<div class="subject-bar">RE: Verification of Active Insurance Coverage - ${riskDetails.subjectSuffix}</div>

<p class="body-text">
  This letter confirms that <strong>${insuredName}</strong> carries active insurance through
  <strong>${carrier}</strong> on the ${riskDetails.bodyNoun} described below.
  This policy is currently in force and in good standing as of the date of this letter.
</p>

<table class="two-col">
  <tr>
    <td style="width:49%; vertical-align:top; padding-right:6px;">
      <div class="policy-box">
        <div class="policy-box-header">Policy Information</div>
        <div class="policy-box-body">
          <table class="policy-grid">
            <tr><td class="lbl">Policy #:</td><td>${policyNumber}</td></tr>
            <tr><td class="lbl">Period:</td><td>${policyPeriod}</td></tr>
            <tr><td class="lbl">Named Insured:</td><td>${insuredName}</td></tr>
            ${
              hasValue(data.coInsured)
                ? `<tr><td class="lbl">Co-Insured:</td><td>${clean(data.coInsured)}</td></tr>`
                : ""
            }
            <tr><td class="lbl">Company:</td><td>${carrier}</td></tr>
            ${
              hasValue(data.policyTypeCode)
                ? `<tr><td class="lbl">Policy Type:</td><td>${clean(data.policyTypeCode)}</td></tr>`
                : ""
            }
          </table>
        </div>
      </div>
    </td>
    <td style="width:2%;"></td>
    <td style="width:49%; vertical-align:top; padding-left:6px;">
      <div class="policy-box">
        <div class="policy-box-header">${riskDetails.header}</div>
        <div class="policy-box-body">
          <table class="policy-grid">
            ${riskRows}
          </table>
        </div>
      </div>
    </td>
  </tr>
</table>

<p class="body-text" style="font-weight:bold; margin-bottom:5px;">Coverage in Force:</p>
<table class="cov-table">
  <thead>
    <tr>
      <th>Coverage</th>
      <th>Limit</th>
      <th>Deductible</th>
      <th>Premium</th>
    </tr>
  </thead>
  <tbody>
    ${coverageRows}
    <tr class="total-row">
      <td>Total Annual Premium</td>
      <td colspan="2">&mdash;</td>
      <td>${totalAnnualPremium}</td>
    </tr>
  </tbody>
</table>

${lienholderBlock}

<p class="body-text">
  For questions or additional documentation, please contact our office at <strong>${AGENCY.phone}</strong>.
</p>

<table class="sig-table">
  <tr>
    <td style="width:50%; vertical-align:bottom;">
      <div class="signature-stack">
        ${signatureImage}
        <div class="sig-line">Authorized Agent Signature</div>
      </div>
    </td>
    <td style="width:8%;"></td>
    <td style="width:42%; vertical-align:bottom;">
      <div class="sig-line">Date</div>
    </td>
  </tr>
  <tr>
    <td style="padding-top:4px; font-size:9.5pt; font-weight:bold;">${AGENCY.agentName}</td>
    <td></td>
    <td style="padding-top:4px; font-size:9.5pt;">${docDate}</td>
  </tr>
  <tr>
    <td style="font-size:8.5pt; color:#444;">${AGENCY.name}</td>
    <td></td><td></td>
  </tr>
  <tr>
    <td style="font-size:8.5pt; color:#444;">${agentId}</td>
    <td></td><td></td>
  </tr>
</table>

<div class="footer">
  <table class="footer-table">
    <tr>
      <td style="vertical-align:middle;">
        <img src="${AGENCY.logo}" alt="${AGENCY.name}" height="24" />
      </td>
      <td class="footer-info">
        ${AGENCY.name} &nbsp;|&nbsp; ${AGENCY.address}, ${AGENCY.city}<br/>
        Phone: ${AGENCY.phone} &nbsp;|&nbsp; ${AGENCY.email} &nbsp;|&nbsp; ${AGENCY.website}<br/>
        <span class="footer-tagline">${AGENCY.tagline}</span>
      </td>
    </tr>
  </table>
  <div class="page-note">Page 1 of 1 &nbsp;|&nbsp; This document is for verification purposes only and does not alter, amend, or extend the policy.</div>
</div>

</body>
</html>`;
}
