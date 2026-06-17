import { type Env, PARSE_PROMPT, generateWithFallback, jsonErrorResponse, jsonHeaders, requireGeminiKey, stripCodeFences } from "./_shared";

const buildParsePrompt = (userInstructions?: string) => {
  const instructions = userInstructions?.trim();
  if (!instructions) return PARSE_PROMPT;

  return `${PARSE_PROMPT}

User instructions for this specific document:
- ${instructions}

Follow those user instructions when choosing which insured item, vehicle, or risk to extract. If the document shows multiple cars, locations, or risks and the user specifies one, only extract the requested one.`;
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const { pdfBase64, fileBase64, mimeType, userInstructions } = (await context.request.json()) as {
      pdfBase64?: string;
      fileBase64?: string;
      mimeType?: string;
      userInstructions?: string;
    };
    const documentBase64 = fileBase64 || pdfBase64;
    const documentMimeType = mimeType || "application/pdf";

    if (!documentBase64) {
      return new Response(JSON.stringify({ error: "Missing fileBase64" }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    const apiKey = requireGeminiKey(context.env);
    const response = await generateWithFallback(apiKey, {
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: documentMimeType,
              data: documentBase64,
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

    return new Response(
      JSON.stringify({ data: JSON.parse(stripCodeFences(text)) }),
      { headers: jsonHeaders },
    );
  } catch (error) {
    return jsonErrorResponse(error);
  }
};
