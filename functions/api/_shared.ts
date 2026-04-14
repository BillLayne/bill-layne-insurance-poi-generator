import { GoogleGenAI } from "@google/genai";

export const DEFAULT_MODELS = ["gemini-3-flash-preview", "gemini-2.5-flash"] as const;

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
    message.includes("503")
  );
};

export const PARSE_PROMPT = `
You are an insurance document parser for Bill Layne Insurance Agency.
Extract ALL of the following fields from this insurance policy PDF.
Return ONLY a raw JSON object, no markdown, no backticks, no explanation.

Required JSON schema:
{
  "carrier": "Insurance company name (e.g. Progressive, Nationwide)",
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

export async function generateWithFallback(
  apiKey: string,
  request: Omit<Parameters<GoogleGenAI["models"]["generateContent"]>[0], "model">,
) {
  const ai = new GoogleGenAI({ apiKey });
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
