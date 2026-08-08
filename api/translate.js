export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      stage: "method",
      error: "Method not allowed",
    });
  }

  try {
    // Tasker에서 JSON 또는 일반 문자열로 와도 둘 다 처리
    let text = "";

    if (typeof req.body === "string") {
      try {
        const parsed = JSON.parse(req.body);
        text = parsed?.text || "";
      } catch {
        text = req.body;
      }
    } else {
      text = req.body?.text || "";
    }

    if (!text || typeof text !== "string") {
      console.error("INPUT_ERROR", {
        bodyType: typeof req.body,
        body: req.body,
      });

      return res.status(400).json({
        ok: false,
        stage: "input",
        error: "text is required",
      });
    }

    console.log("REQUEST_RECEIVED", {
      textLength: text.length,
      hasOpenAIKey: Boolean(process.env.OPENAI_API_KEY),
      hasTelegramToken: Boolean(process.env.TELEGRAM_BOT_TOKEN),
      hasTelegramChatId: Boolean(process.env.TELEGRAM_CHAT_ID),
    });

    // 1. OpenAI 번역
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
                    "and identifiers exactly. Output only the English translation.",
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
      console.error("OPENAI_ERROR", {
        status: openaiResponse.status,
        data: openaiData,
      });

      return res.status(500).json({
        ok: false,
        stage: "openai",
        status: openaiResponse.status,
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
      console.error("TRANSLATION_EMPTY", {
        output: openaiData.output,
      });

      return res.status(500).json({
        ok: false,
        stage: "translation",
        error: "No translation returned",
      });
    }

    console.log("TRANSLATION_OK", {
      translationLength: translation.length,
    });

    // 2. Telegram 채널 전송
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
      console.error("TELEGRAM_ERROR", {
        status: telegramResponse.status,
        data: telegramData,
      });

      return res.status(500).json({
        ok: false,
        stage: "telegram",
        status: telegramResponse.status,
        details: telegramData,
      });
    }

    console.log("TELEGRAM_OK");

    return res.status(200).json({
      ok: true,
      original: text,
      translation,
    });
  } catch (error) {
    console.error("UNEXPECTED_ERROR", error);

    return res.status(500).json({
      ok: false,
      stage: "unexpected",
      error: error?.message || "Internal server error",
    });
  }
}
