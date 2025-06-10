import * as vscode from "vscode";
import { TranslationProvider } from "./translation-provider";

export class GroqTranslationProvider implements TranslationProvider {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    // Get preferred model from settings
    const config = vscode.workspace.getConfiguration("getx-locale");
    this.model = config.get("preferredModel.groq", "mistral-saba-24b");
  }

  async translate(text: string, targetLanguage: string): Promise<string> {
    console.log(
      `[Groq] Starting translation for "${text}" to ${targetLanguage}`
    );
    console.log(`[Groq] Using model: ${this.model}`);

    // Prepare request with stricter system message
    const data = JSON.stringify({
      model: this.model,
      messages: [
        {
          role: "system",
          content: `You are a direct translation engine. Instructions:
1. ONLY output the exact translation of the input text to ${targetLanguage}
2. DO NOT add any explanations, notes, or alternatives
3. DO NOT include quotation marks or formatting
4. DO NOT respond with anything except the translation
5. Keep names and technical terms as-is when appropriate

Example input: "Email"
Example output for Urdu: ای میل`,
        },
        {
          role: "user",
          content: text,
        },
      ],
      temperature: 0.1, // Lower temperature for more consistent outputs
    });

    const options = {
      hostname: "api.groq.com",
      port: 443,
      path: "/openai/v1/chat/completions",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Length": Buffer.byteLength(data),
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
            console.log(`[Groq] Raw response (${statusCode}):`, responseData);
            const parsed = JSON.parse(responseData);

            if (statusCode >= 400 || parsed.error) {
              const errorDetails = parsed.error || {};
              const errorMessage =
                errorDetails.message || `HTTP Error ${statusCode}`;
              console.error(`[Groq] API Error:`, {
                status: statusCode,
                message: errorMessage,
                details: errorDetails,
              });

              const error = new Error(errorMessage);
              (error as any).statusCode = statusCode;
              (error as any).response = parsed;
              reject(error);
              return;
            }

            let translatedText = parsed.choices?.[0]?.message?.content?.trim();
            console.log(`[Groq] Raw translation:`, translatedText);

            if (!translatedText) {
              console.error("[Groq] Empty translation response");
              reject(new Error("Empty translation response from Groq API"));
              return;
            }

            // Clean up response
            translatedText = translatedText
              .replace(/^["']|["']$/g, "") // Remove surrounding quotes
              .split("\n")[0] // Take first line only
              .split(/[.,;:]/) // Remove explanatory text
              .map((s) => s.trim()) // Trim each part
              .filter((s) => s.length > 0)[0]; // Take first non-empty part

            console.log(
              `[Groq] Final translation: "${text}" → "${translatedText}"`
            );
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
  console.log("[Groq Setup] Starting API key verification...");
  const testProvider = new GroqTranslationProvider(apiKey);

  try {
    console.log("[Groq Setup] Testing with model:", testProvider.getModel());
    const response = await testProvider.translate("test", "English");
    console.log("[Groq Setup] Test response:", response);

    // Store the key only if the test was successful
    await context.secrets.store(GROQ_API_KEY_SECRET, apiKey);
    console.log("[Groq Setup] API key verified and stored successfully");
  } catch (error: any) {
    console.error("[Groq Setup] Verification failed:", error);

    // Don't store the key if verification fails
    if (error.statusCode === 401) {
      throw new Error("Invalid API key. Please check your Groq API key.");
    } else if (error.statusCode === 400) {
      throw new Error(
        `Invalid request: ${error.message}. Please verify your API key format.`
      );
    } else if (error.response?.error) {
      throw new Error(`API Error: ${error.response.error.message}`);
    } else {
      throw new Error(`Failed to verify API key: ${error.message || error}`);
    }
  }
}

export async function testGroqApiKey(apiKey: string): Promise<void> {
  const testProvider = new GroqTranslationProvider(apiKey);
  try {
    console.log("[Groq Test] Starting with model:", testProvider.getModel());
    vscode.window.showInformationMessage("Testing Groq API Key...");

    const testTranslation = await testProvider.translate("hello", "Indonesian");
    console.log("[Groq Test] Test response:", testTranslation);

    if (testTranslation && testTranslation !== "hello") {
      vscode.window.showInformationMessage(
        `✅ Groq API Key works! Test translation: "hello" → "${testTranslation}"`
      );
    } else {
      throw new Error("Translation returned unchanged text");
    }
  } catch (error: any) {
    console.error("[Groq Test] Error:", error);
    let errorMessage = "❌ Groq API Key test failed";

    if (error.statusCode === 401) {
      errorMessage =
        "❌ Invalid API Key. Please check your API key and try again.";
    } else if (error.statusCode === 400) {
      errorMessage = `❌ API Error: ${error.message}. Please verify your API key format.`;
    } else if (error.statusCode === 429) {
      errorMessage =
        "❌ Rate limit exceeded. Please try again in a few moments.";
    } else if (error.code === "ETIMEDOUT" || error.code === "ECONNRESET") {
      errorMessage = "❌ Network error. Please check your internet connection.";
    } else {
      errorMessage += `: ${error.message || error}`;
    }

    vscode.window.showErrorMessage(errorMessage);
    throw new Error(errorMessage); // Re-throw to propagate the error
  }
}

export async function deleteGroqApiKey(
  context: vscode.ExtensionContext
): Promise<void> {
  await context.secrets.delete(GROQ_API_KEY_SECRET);
}
