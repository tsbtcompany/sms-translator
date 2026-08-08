export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).send("Method not allowed");
  }

  try {
    const { text } = req.body || {};

    if (!text || typeof text !== "string") {
      return res.status(400).send("text is required");
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
      return res.status(openaiResponse.status).send("OpenAI API request failed");
    }

    const translation =
      data.output
        ?.flatMap((item) => item.content || [])
        ?.filter((item) => item.type === "output_text")
        ?.map((item) => item.text)
        ?.join("")
        ?.trim() || "";

    if (!translation) {
      return res.status(500).send("No translation returned");
    }

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.status(200).send(translation);
  } catch (error) {
    return res.status(500).send(error?.message || "Internal server error");
  }
}
