import { type Env, generateWithFallback, getRefinePrompt, jsonErrorResponse, jsonHeaders, requireGeminiKey, stripCodeFences } from "./_shared";

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const { currentHtml, userPrompt } = (await context.request.json()) as {
      currentHtml?: string;
      userPrompt?: string;
    };

    if (!currentHtml || !userPrompt) {
      return new Response(JSON.stringify({ error: "Missing currentHtml or userPrompt" }), {
        status: 400,
        headers: jsonHeaders,
      });
    }

    const apiKey = requireGeminiKey(context.env);
    const response = await generateWithFallback(apiKey, {
      contents: getRefinePrompt(currentHtml, userPrompt),
      config: {
        temperature: 0.1,
      },
    });

    const text = response.text;
    if (!text) {
      throw new Error("No response from Gemini");
    }

    return new Response(
      JSON.stringify({ html: stripCodeFences(text) }),
      { headers: jsonHeaders },
    );
  } catch (error) {
    return jsonErrorResponse(error);
  }
};
