import { type Env, PARSE_PROMPT, generateWithFallback, jsonErrorResponse, jsonHeaders, requireGeminiKey, stripCodeFences } from "./_shared";

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const { pdfBase64 } = (await context.request.json()) as { pdfBase64?: string };
    if (!pdfBase64) {
      return new Response(JSON.stringify({ error: "Missing pdfBase64" }), {
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

    return new Response(
      JSON.stringify({ data: JSON.parse(stripCodeFences(text)) }),
      { headers: jsonHeaders },
    );
  } catch (error) {
    return jsonErrorResponse(error);
  }
};
