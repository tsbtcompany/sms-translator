export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  try {
    const { text } = req.body || {};

    if (!text || typeof text !== "string") {
      return res.status(400).json({
        error: "text is required",
      });
    }

    const openaiResponse = await fetch(
      "https://api.openai.com/v1/responses",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-5",
          input: [
            {
              role: "system",
              content: [
                {
                  type: "input_text",
                  text:
                    "Translate the following Korean SMS message into clear natural English. " +
                    "Preserve all verification codes, numbers, URLs, company names, auction names, " +
                    "and other identifiers exactly. Do not add explanations. Output only the English translation.",
                },
              ],
            },
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text,
                },
              ],
            },
          ],
        }),
      }
    );

    const data = await openaiResponse.json();

    if (!openaiResponse.ok) {
      console.error("OpenAI API error:", data);

      return res.status(openaiResponse.status).json({
        error: "OpenAI API request failed",
        details: data,
      });
    }

    const translation =
      data.output
        ?.flatMap((item) => item.content || [])
        ?.filter((item) => item.type === "output_text")
        ?.map((item) => item.text)
        ?.join("")
        ?.trim() || "";

    if (!translation) {
      console.error("No translation returned:", data);

      return res.status(500).json({
        error: "No translation returned from OpenAI",
      });
    }

    return res.status(200).json({
      original: text,
      translation,
    });
  } catch (error) {
    console.error("Server error:", error);

    return res.status(500).json({
      error: "Internal server error",
      message: error?.message || "Unknown error",
    });
  }
}
