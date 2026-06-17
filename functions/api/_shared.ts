export const DEFAULT_MODELS = ["gemini-2.5-flash", "gemini-3-flash-preview"] as const;

export type Env = {
  GEMINI_API_KEY: string;
};

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

export const PARSE_PROMPT = `
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

export const getRefinePrompt = (currentHtml: string, userPrompt: string) => `
You are an expert HTML/CSS developer. Here is an existing HTML document:

\`\`\`html
${currentHtml}
\`\`\`

The user wants to make the following changes:
"${userPrompt}"

Please return the updated HTML document incorporating these changes.
Return ONLY the raw HTML code, no markdown formatting, no backticks, no explanations.
`;

export const stripCodeFences = (text: string) =>
  text.replace(/```json|```html|```/g, "").trim();

export const jsonHeaders = { "content-type": "application/json; charset=utf-8" };

type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

type GeminiRequest = {
  contents:
    | string
    | { parts: GeminiPart[] }
    | Array<{ role?: string; parts: GeminiPart[] }>;
  config?: {
    temperature?: number;
    responseMimeType?: string;
  };
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  promptFeedback?: {
    blockReason?: string;
    blockReasonMessage?: string;
  };
  error?: {
    message?: string;
  };
};

const normalizeContents = (contents: GeminiRequest["contents"]) => {
  if (typeof contents === "string") {
    return [{ role: "user", parts: [{ text: contents }] }];
  }

  if (Array.isArray(contents)) {
    return contents;
  }

  return [{ role: "user", parts: contents.parts }];
};

const generateOnce = async (
  apiKey: string,
  model: string,
  request: GeminiRequest,
) => {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify({
        contents: normalizeContents(request.contents),
        generationConfig: request.config,
      }),
    },
  );

  const payload = (await response.json().catch(() => null)) as GeminiResponse | null;

  if (!response.ok) {
    throw new Error(payload?.error?.message || `Gemini request failed with status ${response.status}`);
  }

  const text = payload?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("")
    .trim();

  if (!text) {
    if (payload?.promptFeedback?.blockReason) {
      throw new Error(
        payload.promptFeedback.blockReasonMessage ||
          `Gemini blocked the request: ${payload.promptFeedback.blockReason}`,
      );
    }
    throw new Error("No response from Gemini");
  }

  return { text };
};

export async function generateWithFallback(
  apiKey: string,
  request: GeminiRequest,
) {
  let lastError: unknown;

  for (const model of DEFAULT_MODELS) {
    try {
      return await generateOnce(apiKey, model, request);
    } catch (error) {
      lastError = error;
      if (!shouldRetryOnFallback(error) || model === DEFAULT_MODELS[DEFAULT_MODELS.length - 1]) {
        throw error;
      }
    }
  }

  throw lastError;
}

export function requireGeminiKey(env: Partial<Env>) {
  if (!env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured.");
  }
  return env.GEMINI_API_KEY;
}

export function jsonErrorResponse(error: unknown, status = 500) {
  return new Response(
    JSON.stringify({ error: getErrorMessage(error) }),
    { status, headers: jsonHeaders },
  );
}
