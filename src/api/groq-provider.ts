import * as vscode from "vscode";
import { TranslationProvider } from "./translation-provider";

export class GroqTranslationProvider implements TranslationProvider {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    // Get preferred model from settings
    const config = vscode.workspace.getConfiguration("getx-locale");
    this.model = config.get(
      "preferredModel.groq",
      "meta-llama/llama-4-scout-17b-16e-instruct"
    );
  }

  async translate(text: string, targetLanguage: string): Promise<string> {
    const data = JSON.stringify({
      model: this.model,
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
      temperature: 0.3,
    });

    const options = {
      hostname: "api.groq.com",
      port: 443,
      path: "/openai/v1/chat/completions",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Length": data.length,
      },
      timeout: 10000,
    };

    return new Promise((resolve, reject) => {
      const req = require("https").request(options, (res: any) => {
        let responseData = "";
        const statusCode = res.statusCode || 500;

        res.on("data", (chunk: any) => {
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

            const parsed = JSON.parse(responseData);

            if (parsed.error) {
              const error = new Error(parsed.error.message);
              (error as any).code = parsed.error.code;
              reject(error);
              return;
            }

            const translatedText =
              parsed.choices?.[0]?.message?.content?.trim();
            if (!translatedText) {
              reject(new Error("Invalid response format from Groq API"));
              return;
            }

            resolve(translatedText);
          } catch (error) {
            reject(new Error(`Failed to parse Groq response: ${error}`));
          }
        });
      });

      req.on("error", (error: any) => {
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

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey;
  }

  getName(): string {
    return "Groq";
  }

  getModel(): string {
    return this.model;
  }
}

export const GROQ_API_KEY_SECRET = "getx-locale.groq-api-key";

export async function getGroqApiKey(
  context: vscode.ExtensionContext
): Promise<string | undefined> {
  return await context.secrets.get(GROQ_API_KEY_SECRET);
}

export async function setGroqApiKey(
  context: vscode.ExtensionContext,
  apiKey: string
): Promise<void> {
  // Store the key first
  await context.secrets.store(GROQ_API_KEY_SECRET, apiKey);

  // Verify the key works by attempting a simple translation
  const provider = new GroqTranslationProvider(apiKey);
  try {
    await provider.translate("test", "English");
  } catch (error: any) {
    // If verification fails, delete the stored key
    await context.secrets.delete(GROQ_API_KEY_SECRET);

    if (error.statusCode === 401) {
      throw new Error("Invalid API key. The key was not accepted by Groq.");
    } else {
      throw new Error(`Failed to verify API key: ${error.message || error}`);
    }
  }
}

export async function testGroqApiKey(apiKey: string): Promise<void> {
  const provider = new GroqTranslationProvider(apiKey);
  try {
    vscode.window.showInformationMessage("Testing Groq API Key...");
    const testTranslation = await provider.translate("hello", "Indonesian");
    if (testTranslation && testTranslation !== "hello") {
      vscode.window.showInformationMessage(
        `✅ Groq API Key works! Test translation: "hello" → "${testTranslation}"`
      );
    } else {
      vscode.window.showErrorMessage(
        "❌ Groq API Key test failed: Translation returned unchanged text"
      );
    }
  } catch (error: any) {
    let errorMessage = "❌ Groq API Key test failed";

    if (error.statusCode === 401) {
      errorMessage =
        "❌ Invalid API Key. Please check your API key and try again.";
    } else if (error.statusCode === 429) {
      errorMessage =
        "❌ Rate limit exceeded. Please try again in a few moments.";
    } else if (error.code === "ETIMEDOUT" || error.code === "ECONNRESET") {
      errorMessage = "❌ Network error. Please check your internet connection.";
    } else {
      errorMessage += `: ${error.message || error}`;
    }

    vscode.window.showErrorMessage(errorMessage);
  }
}

export async function deleteGroqApiKey(
  context: vscode.ExtensionContext
): Promise<void> {
  await context.secrets.delete(GROQ_API_KEY_SECRET);
}
