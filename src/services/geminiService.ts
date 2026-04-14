import { GoogleGenAI } from "@google/genai";
import { ParsedPolicyData } from "../types";

const DEFAULT_MODELS = ["gemini-3-flash-preview", "gemini-2.5-flash"] as const;

const PARSE_PROMPT = `
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
    message.includes("503")
  );
};

const stripCodeFences = (text: string) => text.replace(/```json|```html|```/g, "").trim();

const shouldUseLocalGemini = () =>
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") &&
  Boolean(process.env.GEMINI_API_KEY);

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

export async function parsePDFWithGemini(pdfBase64: string): Promise<ParsedPolicyData> {
  if (shouldUseLocalGemini()) {
    const ai = getLocalAiClient();
    const response = await generateWithFallback(ai, {
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: "application/pdf",
              data: pdfBase64,
            },
          },
          {
            text: PARSE_PROMPT,
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

    return JSON.parse(stripCodeFences(text)) as ParsedPolicyData;
  }

  const result = await callServer<{ data: ParsedPolicyData }>("/api/parse-policy", {
    pdfBase64,
  });
  return result.data;
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

  const result = await callServer<{ html: string }>("/api/refine-document", {
    currentHtml,
    userPrompt,
  });
  return result.html;
}

export { PARSE_PROMPT, getRefinePrompt, stripCodeFences, getErrorMessage };
