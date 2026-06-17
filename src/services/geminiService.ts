import { GoogleGenAI } from "@google/genai";
import { ParsedPolicyData } from "../types";

const DEFAULT_MODELS = ["gemini-2.5-flash", "gemini-3-flash-preview"] as const;

const PARSE_PROMPT = `
You are an insurance document parser for Bill Layne Insurance Agency.
Extract ALL of the following fields from the uploaded insurance document image or PDF.
Return ONLY a raw JSON object, no markdown, no backticks, no explanation.

Required JSON schema:
{
  "carrier": "Insurance company name (e.g. Progressive, Nationwide)",
  "policyCategory": "One of: home, auto, motorcycle, rv, boat, renters, condo, umbrella, dwelling-fire, other",
  "policyTypeCode": "Policy type/form code if shown, e.g. HO, HO3, DP3, PAP, MC, PL",
  "policyNumber": "Policy number",
  "policyPeriodStart": "MM/DD/YYYY",
  "policyPeriodEnd": "MM/DD/YYYY",
  "effectiveDate": "MM/DD/YYYY",
  "namedInsured": "Full name",
  "coInsured": "Spouse or co-insured name if present, else null",
  "insuredAddress": "Street address",
  "insuredCity": "City",
  "insuredState": "State abbreviation",
  "insuredZip": "ZIP code",
  "insuredEmail": "Email address or null",
  "vehicleYear": "Year",
  "vehicleMake": "Make",
  "vehicleModel": "Model",
  "vehicleVIN": "VIN number",
  "vehicleType": "e.g. Travel Trailer, Automobile, Motorcycle",
  "vehicleLength": "Length in feet if RV/trailer, else null",
  "vehicleUse": "e.g. Pleasure, Commute, Business",
  "garagingZip": "ZIP code where vehicle is garaged",
  "garagingState": "State",
  "propertyDescription": "For home/property policies: dwelling or risk description such as 1 Story Dwelling, Condo Unit, Rental Dwelling; else null",
  "propertyAddress": "Risk location street address for home/property policies; else null",
  "propertyCity": "Risk location city for home/property policies; else null",
  "propertyState": "Risk location state for home/property policies; else null",
  "propertyZip": "Risk location ZIP for home/property policies; else null",
  "constructionType": "Frame, Brick, Masonry, etc. for property policies; else null",
  "occupancyType": "Owner, Tenant, Seasonal, Primary Residence, etc. for property policies; else null",
  "yearBuilt": "Year built for property policies; else null",
  "ratingBase": "Dollar amount (ACV rating base) or null",
  "totalAnnualPremium": "Total 12-month premium dollar amount",
  "monthlyPayment": "Monthly installment amount or null",
  "downPayment": "Initial/down payment amount or null",
  "paymentPlan": "e.g. 12 payments, Paid in Full",
  "lienholderName": "Name of lienholder, loss payee, or mortgagee if present, else null",
  "lienholderAddress": "Street address of lienholder (include ISAOA/ATIMA and Loan Number if present, separated by newlines \\n), else null",
  "lienholderCityStateZip": "City, State, ZIP of lienholder if present, else null",
  "coverages": [
    {
      "name": "Coverage name",
      "limit": "Limit or Actual Cash Value",
      "deductible": "Deductible amount or null",
      "premium": "Dollar amount or Included or null"
    }
  ],
  "discounts": ["List of discount names applied"],
  "documentDate": "Date on the document MM/DD/YYYY"
}

If a field is not found in the document, use null.
For coverages, include ALL coverages listed including included ones.
Important extraction rules:
- First classify the policy into the correct policyCategory.
- If the document is a homeowners, condo, renters, dwelling, landlord, or other property policy, populate the property fields and leave vehicle fields null unless the insured risk is actually a vehicle.
- If the document is an auto, motorcycle, RV, trailer, or boat policy, populate the vehicle fields and leave property-only fields null unless a property risk is the primary insured item.
- If a policy number box is blank, says office use only, or has not been issued yet, return policyNumber as null. Never invent a policy number from a quote number, loan number, or account number.
- Quote number, loan number, and lienholder account number are not policy numbers.
`;

const buildParsePrompt = (userInstructions?: string) => {
  const instructions = userInstructions?.trim();
  if (!instructions) return PARSE_PROMPT;

  return `${PARSE_PROMPT}

User instructions for this specific document:
- ${instructions}

Follow those user instructions when choosing which insured item, vehicle, or risk to extract. If the document shows multiple cars, locations, or risks and the user specifies one, only extract the requested one.`;
};

const getRefinePrompt = (currentHtml: string, userPrompt: string) => `
You are an expert HTML/CSS developer. Here is an existing HTML document:

\`\`\`html
${currentHtml}
\`\`\`

The user wants to make the following changes:
"${userPrompt}"

Please return the updated HTML document incorporating these changes.
Return ONLY the raw HTML code, no markdown formatting, no backticks, no explanations.
`;

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  return "Unknown Gemini error";
};

const shouldRetryOnFallback = (error: unknown) => {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("quota") ||
    message.includes("high demand") ||
    message.includes("resource_exhausted") ||
    message.includes("unavailable") ||
    message.includes("429") ||
    message.includes("503") ||
    message.includes("524") ||
    message.includes("timeout") ||
    message.includes("deadline")
  );
};

const stripCodeFences = (text: string) => text.replace(/```json|```html|```/g, "").trim();

const isBlankLike = (value: unknown) => {
  if (value == null) return true;
  if (typeof value !== "string") return false;
  const normalized = value.trim().toLowerCase();
  return !normalized || normalized === "null" || normalized === "undefined" || normalized === "n/a" || normalized === "na";
};

const cleanString = (value: unknown) => (isBlankLike(value) ? "" : String(value).trim());

const cleanNullable = (value: unknown) => (isBlankLike(value) ? null : String(value).trim());

const inferPolicyCategory = (data: Partial<ParsedPolicyData>) => {
  const explicit = cleanString(data.policyCategory).toLowerCase();
  if (explicit) return explicit;

  const policyTypeCode = cleanString(data.policyTypeCode).toLowerCase();
  if (/(^|\b)(ho|dp|mh|condo|renters|renter|landlord|dwelling)(\b|$)/.test(policyTypeCode)) {
    return "home";
  }

  const coverageNames = (data.coverages || [])
    .map((coverage) => cleanString(coverage?.name).toLowerCase())
    .join(" | ");

  if (/(cov a|cov b|cov c|cov d|dwelling|other structures|personal property|loss of use|inland flood|equipment breakdown|refrigerated property)/.test(coverageNames)) {
    return "home";
  }

  const vehicleSignals = [
    cleanString(data.vehicleVIN),
    cleanString(data.vehicleYear),
    cleanString(data.vehicleMake),
    cleanString(data.vehicleModel),
    cleanString(data.vehicleType),
  ].join(" ");

  if (vehicleSignals.trim()) {
    return "auto";
  }

  return "other";
};

const normalizeParsedPolicyData = (raw: Record<string, unknown>) => {
  const parsed: ParsedPolicyData = {
    carrier: cleanString(raw.carrier),
    policyCategory: cleanString(raw.policyCategory),
    policyTypeCode: cleanString(raw.policyTypeCode),
    policyNumber: cleanString(raw.policyNumber),
    policyPeriodStart: cleanString(raw.policyPeriodStart),
    policyPeriodEnd: cleanString(raw.policyPeriodEnd),
    effectiveDate: cleanString(raw.effectiveDate),
    namedInsured: cleanString(raw.namedInsured),
    coInsured: cleanNullable(raw.coInsured),
    insuredAddress: cleanString(raw.insuredAddress),
    insuredCity: cleanString(raw.insuredCity),
    insuredState: cleanString(raw.insuredState),
    insuredZip: cleanString(raw.insuredZip),
    insuredEmail: cleanNullable(raw.insuredEmail),
    vehicleYear: cleanString(raw.vehicleYear),
    vehicleMake: cleanString(raw.vehicleMake),
    vehicleModel: cleanString(raw.vehicleModel),
    vehicleVIN: cleanString(raw.vehicleVIN),
    vehicleType: cleanString(raw.vehicleType),
    vehicleLength: cleanNullable(raw.vehicleLength),
    vehicleUse: cleanString(raw.vehicleUse),
    garagingZip: cleanString(raw.garagingZip),
    garagingState: cleanString(raw.garagingState),
    propertyDescription: cleanString(raw.propertyDescription),
    propertyAddress: cleanString(raw.propertyAddress),
    propertyCity: cleanString(raw.propertyCity),
    propertyState: cleanString(raw.propertyState),
    propertyZip: cleanString(raw.propertyZip),
    constructionType: cleanString(raw.constructionType),
    occupancyType: cleanString(raw.occupancyType),
    yearBuilt: cleanString(raw.yearBuilt),
    ratingBase: cleanNullable(raw.ratingBase),
    totalAnnualPremium: cleanString(raw.totalAnnualPremium),
    monthlyPayment: cleanNullable(raw.monthlyPayment),
    downPayment: cleanNullable(raw.downPayment),
    paymentPlan: cleanString(raw.paymentPlan),
    lienholderName: cleanNullable(raw.lienholderName),
    lienholderAddress: cleanNullable(raw.lienholderAddress),
    lienholderCityStateZip: cleanNullable(raw.lienholderCityStateZip),
    coverages: Array.isArray(raw.coverages)
      ? raw.coverages.map((coverage) => ({
          name: cleanString((coverage as Record<string, unknown>)?.name),
          limit: cleanNullable((coverage as Record<string, unknown>)?.limit),
          deductible: cleanNullable((coverage as Record<string, unknown>)?.deductible),
          premium: cleanNullable((coverage as Record<string, unknown>)?.premium),
        }))
      : [],
    discounts: Array.isArray(raw.discounts)
      ? raw.discounts.map((discount) => cleanString(discount)).filter(Boolean)
      : [],
    documentDate: cleanString(raw.documentDate),
  };

  parsed.policyCategory = inferPolicyCategory(parsed);

  if (parsed.policyCategory === "home") {
    parsed.propertyAddress ||= parsed.insuredAddress;
    parsed.propertyCity ||= parsed.insuredCity;
    parsed.propertyState ||= parsed.insuredState;
    parsed.propertyZip ||= parsed.insuredZip;
  }

  return parsed;
};

const shouldUseLocalGemini = () =>
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") &&
  Boolean(process.env.GEMINI_API_KEY);

const shouldUseBundledGemini = () => Boolean(process.env.GEMINI_API_KEY);

const generateWithFallback = async (
  ai: GoogleGenAI,
  request: Omit<Parameters<GoogleGenAI["models"]["generateContent"]>[0], "model">,
) => {
  let lastError: unknown;

  for (const model of DEFAULT_MODELS) {
    try {
      return await ai.models.generateContent({ ...request, model });
    } catch (error) {
      lastError = error;
      if (!shouldRetryOnFallback(error) || model === DEFAULT_MODELS[DEFAULT_MODELS.length - 1]) {
        throw error;
      }
    }
  }

  throw lastError;
};

const getLocalAiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Gemini API key is missing for local development.");
  }
  return new GoogleGenAI({ apiKey });
};

async function callServer<T>(path: string, payload: Record<string, unknown>): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const json = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(json?.error || `Request failed with status ${response.status}`);
  }

  return json as T;
}

export async function parseInsuranceFileWithGemini(
  fileBase64: string,
  mimeType: string,
  userInstructions?: string,
): Promise<ParsedPolicyData> {
  if (shouldUseLocalGemini()) {
    const ai = getLocalAiClient();
    const response = await generateWithFallback(ai, {
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data: fileBase64,
            },
          },
          {
            text: buildParsePrompt(userInstructions),
          },
        ],
      },
      config: {
        temperature: 0.1,
        responseMimeType: "application/json",
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error("No response from Gemini");
    }

    return normalizeParsedPolicyData(JSON.parse(stripCodeFences(text)) as Record<string, unknown>);
  }

  try {
    const result = await callServer<{ data: ParsedPolicyData }>("/api/parse-policy", {
      fileBase64,
      mimeType,
      userInstructions,
    });
    return normalizeParsedPolicyData(result.data as unknown as Record<string, unknown>);
  } catch (error) {
    const message = getErrorMessage(error);
    if (!shouldUseBundledGemini() || !message.includes("GEMINI_API_KEY is not configured")) {
      throw error;
    }

    const ai = getLocalAiClient();
    const response = await generateWithFallback(ai, {
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data: fileBase64,
            },
          },
          {
            text: buildParsePrompt(userInstructions),
          },
        ],
      },
      config: {
        temperature: 0.1,
        responseMimeType: "application/json",
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error("No response from Gemini");
    }

    return normalizeParsedPolicyData(JSON.parse(stripCodeFences(text)) as Record<string, unknown>);
  }
}

export async function refineHTMLWithGemini(currentHtml: string, userPrompt: string): Promise<string> {
  if (shouldUseLocalGemini()) {
    const ai = getLocalAiClient();
    const response = await generateWithFallback(ai, {
      contents: getRefinePrompt(currentHtml, userPrompt),
      config: {
        temperature: 0.1,
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error("No response from Gemini");
    }

    return stripCodeFences(text);
  }

  try {
    const result = await callServer<{ html: string }>("/api/refine-document", {
      currentHtml,
      userPrompt,
    });
    return result.html;
  } catch (error) {
    const message = getErrorMessage(error);
    if (!shouldUseBundledGemini() || !message.includes("GEMINI_API_KEY is not configured")) {
      throw error;
    }

    const ai = getLocalAiClient();
    const response = await generateWithFallback(ai, {
      contents: getRefinePrompt(currentHtml, userPrompt),
      config: {
        temperature: 0.1,
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error("No response from Gemini");
    }

    return stripCodeFences(text);
  }
}

export { PARSE_PROMPT, buildParsePrompt, getRefinePrompt, stripCodeFences, getErrorMessage };
