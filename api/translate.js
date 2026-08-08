const OPENAI_URL = "https://api.openai.com/v1/responses";
const HANGUL_REGEX = /[가-힣ㄱ-ㅎㅏ-ㅣ]/;

async function requestEnglishTranslation(text, instruction) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(OPENAI_URL, {
      method: "POST",
      signal: controller.signal,
