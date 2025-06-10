import * as https from "https";
import * as vscode from "vscode";

interface OpenAIResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message: string;
    type: string;
    code: string;
  };
}

export async function translateWithOpenAI(
  text: string,
  targetLanguage: string,
  apiKey: string,
  maxRetries: number = 3
): Promise<string> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await translateWithOpenAIAttempt(text, targetLanguage, apiKey);
    } catch (error: any) {
      if (attempt === maxRetries || !isRetryableError(error)) {
        throw error;
      }
      // Exponential backoff with jitter
      const delay = Math.min(
        1000 * Math.pow(2, attempt - 1) + Math.random() * 1000,
        10000
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  return text; // Fallback to original text if all retries fail
}

function isRetryableError(error: any): boolean {
  // Retry on network errors, rate limits, and 5xx server errors
  return (
    error.code === "ECONNRESET" ||
    error.code === "ETIMEDOUT" ||
    error.message?.includes("rate_limit") ||
    (error.statusCode && error.statusCode >= 500)
  );
}

async function translateWithOpenAIAttempt(
  text: string,
  targetLanguage: string,
  apiKey: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `You are a professional translator. Translate the given text to ${targetLanguage}. Return only the translated text, nothing else. Keep the same tone and context.`,
        },
        {
          role: "user",
          content: text,
        },
      ],
      max_tokens: 100,
      temperature: 0.3,
    });

    const options = {
      hostname: "api.openai.com",
      port: 443,
      path: "/v1/chat/completions",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "Content-Length": data.length,
      },
      timeout: 10000, // 10 second timeout
    };

    const req = https.request(options, (res) => {
      let responseData = "";
      const statusCode = res.statusCode || 500;

      res.on("data", (chunk) => {
        responseData += chunk;
      });

      res.on("end", () => {
        try {
          if (statusCode >= 400) {
            const error = new Error(`HTTP Error ${statusCode}`);
            (error as any).statusCode = statusCode;
            reject(error);
            return;
          }

          const parsed = JSON.parse(responseData) as OpenAIResponse;

          if (parsed.error) {
            const error = new Error(parsed.error.message);
            (error as any).code = parsed.error.code;
            reject(error);
            return;
          }

          const translatedText = parsed.choices?.[0]?.message?.content?.trim();
          if (!translatedText) {
            reject(new Error("Invalid response format from OpenAI API"));
            return;
          }

          resolve(translatedText);
        } catch (error) {
          reject(new Error(`Failed to parse OpenAI response: ${error}`));
        }
      });
    });

    req.on("error", (error) => {
      reject(error);
    });

    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Request timed out"));
    });

    req.write(data);
    req.end();
  });
}

// Language mapping for OpenAI
export const languageMapping: { [key: string]: string } = {
  en_US: "English",
  id_ID: "Indonesian",
  fr: "French",
  es: "Spanish",
  pt_BR: "Portuguese (Brazil)",
  ur_PK: "Urdu",
  ar: "Arabic",
  zh_CN: "Chinese (Simplified)",
  ja: "Japanese",
  ko: "Korean",
  de: "German",
  it: "Italian",
  ru: "Russian",
  nl: "Dutch",
  tr: "Turkish",
  hi: "Hindi",
  th: "Thai",
  vi: "Vietnamese",
};
