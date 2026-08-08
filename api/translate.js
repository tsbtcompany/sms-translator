const OPENAI_URL = "https://api.openai.com/v1/responses";
const HANGUL_REGEX = /[가-힣ㄱ-ㅎㅏ-ㅣ]/;

function extractOutputText(data) {
  return (
    data?.output
      ?.flatMap((item) => item.content || [])
      ?.filter((item) => item.type === "output_text")
      ?.map((item) => item.text || "")
      ?.join("")
      ?.trim() || ""
  );
}

async function translateToEnglish(text, extraInstruction = "") {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(OPENAI_URL, {
      method: "POST",
      signal: controller.signal,
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
                  "Translate the entire SMS into clear natural English. " +
                  "Every Korean word must be translated into English, including generic business terms such as 옥션, 경매, 입찰, 인증번호, 안내, and Web발신. " +
                  "Do not leave any Korean/Hangul characters in the output. " +
                  "Use natural established English names where appropriate; for example, 'K Car 옥션' should become 'K Car Auction'. " +
                  "Preserve verification codes, numbers, URLs, dates, phone numbers, and other identifiers exactly. " +
                  "Output only the English translation, with no explanation or quotation marks. " +
                  extraInstruction,
              },
            ],
          },
          {
            role: "user",
            content: [{ type: "input_text", text }],
          },
        ],
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("OPENAI_ERROR", { status: response.status, data });
      return "";
    }

    return extractOutputText(data);
  } catch (error) {
    console.error("OPENAI_EXCEPTION", error?.message || error);
    return "";
  } finally {
    clearTimeout(timeout);
  }
}

async function sendTelegram(message) {
  const response = await fetch(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: process.env.TELEGRAM_CHAT_ID,
        text: message,
      }),
    }
  );

  const data = await response.json();
  if (!response.ok || !data.ok) {
    console.error("TELEGRAM_ERROR", { status: response.status, data });
    throw new Error(`Telegram send failed: ${data?.description || response.status}`);
  }

  return data;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  let originalText = "";

  try {
    if (typeof req.body === "string") {
      try {
        const parsed = JSON.parse(req.body);
        originalText = parsed?.text || req.body;
      } catch {
        originalText = req.body;
      }
    } else {
      originalText = req.body?.text || "";
    }

    originalText = String(originalText || "").trim();

    if (!originalText) {
      return res.status(400).json({ ok: false, error: "text is required" });
    }

    console.log("REQUEST_RECEIVED", {
      textLength: originalText.length,
      hasOpenAIKey: Boolean(process.env.OPENAI_API_KEY),
      hasTelegramToken: Boolean(process.env.TELEGRAM_BOT_TOKEN),
      hasTelegramChatId: Boolean(process.env.TELEGRAM_CHAT_ID),
    });

    // First translation attempt.
    let translation = await translateToEnglish(originalText);

    // If any Korean remains, force one cleanup pass.
    if (translation && HANGUL_REGEX.test(translation)) {
      console.warn("HANGUL_REMAINS_AFTER_FIRST_PASS", { translation });
      translation = await translateToEnglish(
        originalText,
        "This is a strict cleanup pass. The final answer must contain zero Hangul characters. Translate every Korean term into English."
      );
    }

    const translationSucceeded =
      Boolean(translation) && !HANGUL_REGEX.test(translation);

    const telegramMessage = translationSucceeded
      ? translation
      : `[Translation unavailable — original message]\n${originalText}`;

    if (translationSucceeded) {
      console.log("TRANSLATION_OK", { translationLength: translation.length });
    } else {
      console.warn("TRANSLATION_FALLBACK", {
        hadTranslation: Boolean(translation),
        hangulRemaining: Boolean(translation && HANGUL_REGEX.test(translation)),
      });
    }

    await sendTelegram(telegramMessage);
    console.log("TELEGRAM_OK", { fallback: !translationSucceeded });

    return res.status(200).json({
      ok: true,
      fallback: !translationSucceeded,
      original: originalText,
      translation: translationSucceeded ? translation : null,
    });
  } catch (error) {
    console.error("UNEXPECTED_ERROR", error?.message || error);

    // Last-resort fallback: if anything failed after input parsing, try to send the original SMS.
    if (originalText) {
      try {
        await sendTelegram(`[Processing error — original message]\n${originalText}`);
        console.log("LAST_RESORT_FALLBACK_OK");
        return res.status(200).json({
          ok: true,
          fallback: true,
          original: originalText,
          translation: null,
        });
      } catch (fallbackError) {
        console.error("LAST_RESORT_FALLBACK_FAILED", fallbackError?.message || fallbackError);
      }
    }

    return res.status(500).json({
      ok: false,
      error: error?.message || "Internal server error",
    });
  }
}
