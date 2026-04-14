import { AGENCY, CARRIER_LOGOS, AGENT_IDS } from "../constants";
import { ParsedPolicyData, Lienholder } from "../types";

export function buildPOIDocument(data: ParsedPolicyData, lienholder: Lienholder, docDate: string): string {
  if (!data) return "";

  let carrierLogoUrl = CARRIER_LOGOS[data.carrier || ""] || "";

  if (!carrierLogoUrl && data.carrier) {
    // Try to find a matching logo by checking if a key is part of the carrier name
    const key = Object.keys(CARRIER_LOGOS).find((k) =>
      data.carrier.toLowerCase().includes(k.toLowerCase())
    );
    if (key) {
      carrierLogoUrl = CARRIER_LOGOS[key];
    }
  }

  let agentIdValue = AGENT_IDS[data.carrier || ""];
  if (!agentIdValue && data.carrier) {
    const key = Object.keys(AGENT_IDS).find((k) =>
      data.carrier.toLowerCase().includes(k.toLowerCase())
    );
    if (key) {
      agentIdValue = AGENT_IDS[key];
    }
  }

  const agentId = agentIdValue
    ? `Agent #${agentIdValue} — ${data.carrier || ""} Authorized`
    : "Licensed Independent Agent";

  const coverageRows = (data.coverages || [])
    .map(
      (c) => `
    <tr>
      <td>${c.name || ""}</td>
      <td>${c.limit || "—"}</td>
      <td>${c.deductible || "—"}</td>
      <td>${c.premium || "—"}</td>
    </tr>
  `
    )
    .join("");

  const formattedAddress = lienholder?.address ? lienholder.address.replace(/\n/g, '<br/>') : "";

  const lienholderBlock = lienholder?.name
    ? `
    <div class="lien-box">
      <div class="lien-box-header">★ Lienholder / Loss Payee on File</div>
      <div class="lien-box-body">
        <table class="lien-grid">
          <tr>
            <td class="lbl" style="width:18%;">Lienholder Name:</td>
            <td style="width:40%;"><strong>${lienholder.name || ""}</strong></td>
            <td class="lbl" style="width:15%;">Interest:</td>
            <td style="width:27%;">Loss Payee / Lienholder</td>
          </tr>
          <tr>
            <td class="lbl">Address:</td>
            <td colspan="3">
              ${formattedAddress}<br/>
              ${lienholder.cityStateZip || ""}
            </td>
          </tr>
        </table>
        <p style="font-size:8pt; margin-top:4px; color:#555;">
          ${lienholder.name || ""} is recorded as Loss Payee. In the event of a covered total or partial loss,
          settlement proceeds will be issued jointly or as directed in accordance with their financial interest.
        </p>
      </div>
    </div>
  `
    : "";

  const vehicleDetail = data.vehicleLength
    ? `${data.vehicleType || ""} / ${data.vehicleLength} ft.`
    : (data.vehicleType || "");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Verification of Insurance - ${data.namedInsured || "Document"}</title>
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
  .sig-line { border-top: 1.5px solid #000; padding-top: 2px; margin-top: 12px; font-size: 8pt; }
  .footer { border-top: 2px solid #003d7a; padding-top: 4px; margin-top: 6px; }
  .footer-table { width: 100%; border-collapse: collapse; }
  .footer-logo img { height: 24px; }
  .footer-info { text-align: right; font-size: 7.5pt; color: #333; line-height: 1.35; }
  .footer-tagline { font-style: italic; font-size: 7pt; color: #003d7a; }
  .page-note { text-align: center; font-size: 7pt; color: #777; margin-top: 3px; }
</style>
</head>
<body>

<table class="header-table">
  <tr>
    <td class="carrier-logo">
      <img src="${carrierLogoUrl}" alt="${data.carrier}" onerror="this.style.display='none'" />
      <span style="font-size:11pt; font-weight:bold; color:#003d7a;">${carrierLogoUrl ? "" : data.carrier}</span>
    </td>
    <td style="width:55%; text-align:right;">
      <div class="doc-info-box">
        <div class="doc-title">VERIFICATION OF INSURANCE</div>
        <div class="doc-sub">Policy No: <strong>${data.policyNumber}</strong> &nbsp;|&nbsp; Date: ${docDate}</div>
        <div class="doc-sub">${data.carrier}</div>
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
        lienholder.name
          ? `
        <div class="addr-name">${lienholder.name.toUpperCase()}</div>
        <div class="addr-line">${formattedAddress}</div>
        <div class="addr-line">${lienholder.cityStateZip}</div>
      `
          : `<div class="addr-line" style="color:#666; font-style:italic;">See Lienholder section below</div>`
      }
    </td>
    <td style="width:52%; vertical-align:top;">
      <div class="addr-label">Insured:</div>
      <div class="addr-name">${data.namedInsured.toUpperCase()}</div>
      <div class="addr-line">${data.insuredAddress}</div>
      <div class="addr-line">${data.insuredCity}, ${data.insuredState} ${data.insuredZip}</div>
      ${
        data.insuredEmail
          ? `<div class="addr-line" style="margin-top:3px; color:#444; font-size:8.5pt;">${data.insuredEmail}</div>`
          : ""
      }
    </td>
  </tr>
</table>

<div class="subject-bar">RE: Verification of Active Insurance Coverage — ${data.vehicleType}</div>

<p class="body-text">
  This letter confirms that <strong>${data.namedInsured}</strong> carries active insurance through 
  <strong>${data.carrier}</strong> on the vehicle described below. 
  This policy is currently in force and in good standing as of the date of this letter.
</p>

<table class="two-col">
  <tr>
    <td style="width:49%; vertical-align:top; padding-right:6px;">
      <div class="policy-box">
        <div class="policy-box-header">Policy Information</div>
        <div class="policy-box-body">
          <table class="policy-grid">
            <tr><td class="lbl">Policy #:</td><td>${data.policyNumber}</td></tr>
            <tr><td class="lbl">Period:</td><td>${data.policyPeriodStart} – ${data.policyPeriodEnd}</td></tr>
            <tr><td class="lbl">Named Insured:</td><td>${data.namedInsured}</td></tr>
            ${
              data.coInsured
                ? `<tr><td class="lbl">Co-Insured:</td><td>${data.coInsured}</td></tr>`
                : ""
            }
            <tr><td class="lbl">Company:</td><td>${data.carrier}</td></tr>
          </table>
        </div>
      </div>
    </td>
    <td style="width:2%;"></td>
    <td style="width:49%; vertical-align:top; padding-left:6px;">
      <div class="policy-box">
        <div class="policy-box-header">Insured Vehicle / Collateral</div>
        <div class="policy-box-body">
          <table class="policy-grid">
            <tr><td class="lbl">Vehicle:</td><td>${data.vehicleYear} ${data.vehicleMake} ${data.vehicleModel}</td></tr>
            <tr><td class="lbl">VIN:</td><td>${data.vehicleVIN}</td></tr>
            <tr><td class="lbl">Type:</td><td>${vehicleDetail}</td></tr>
            <tr><td class="lbl">Garaging:</td><td>${data.garagingZip}, ${data.garagingState}</td></tr>
            ${
              data.ratingBase
                ? `<tr><td class="lbl">ACV Rating Base:</td><td>${data.ratingBase}</td></tr>`
                : ""
            }
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
      <td colspan="2">—</td>
      <td>${data.totalAnnualPremium}</td>
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
      <div class="sig-line">Authorized Agent Signature</div>
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
