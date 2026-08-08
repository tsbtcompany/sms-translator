export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { text } = req.body || {};

    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "text is required" });
    }

    // 1. OpenAI로 영어 번역
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
                    "Preserve verification codes, numbers, URLs, company names, auction names, " +
                    "and other identifiers exactly. Output only the English translation.",
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

    const openaiData = await openaiResponse.json();

    if (!openaiResponse.ok) {
      return res.status(openaiResponse.status).json({
        error: "OpenAI request failed",
        details: openaiData,
      });
    }

    const translation =
      openaiData.output
        ?.flatMap((item) => item.content || [])
        ?.filter((item) => item.type === "output_text")
        ?.map((item) => item.text)
        ?.join("")
        ?.trim() || "";

    if (!translation) {
      return res.status(500).json({
        error: "No translation returned",
      });
    }

    // 2. Telegram 채널로 번역문 전송
    const telegramResponse = await fetch(
      `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          chat_id: process.env.TELEGRAM_CHAT_ID,
          text: translation,
        }),
      }
    );

    const telegramData = await telegramResponse.json();

    if (!telegramResponse.ok || !telegramData.ok) {
      return res.status(500).json({
        error: "Telegram send failed",
        details: telegramData,
      });
    }

    return res.status(200).json({
      ok: true,
      original: text,
      translation,
    });
  } catch (error) {
    return res.status(500).json({
      error: error?.message || "Internal server error",
    });
  }
}
