import * as vscode from "vscode";

export interface TranslationProvider {
  translate(text: string, targetLanguage: string): Promise<string>;
  isAvailable(): Promise<boolean>;
  getName(): string;
  getModel(): string;
}

export class OpenAITranslationProvider implements TranslationProvider {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    const config = vscode.workspace.getConfiguration("getx-locale");
    this.model = config.get("preferredModel.openai", "gpt-3.5-turbo");
  }

  async translate(text: string, targetLanguage: string): Promise<string> {
    const data = JSON.stringify({
      model: this.model,
      messages: [
        {
          role: "system",
          content: `You are a translation engine specialized in ${targetLanguage}. Rules:
1. Translate the given text precisely to ${targetLanguage}
2. ONLY return the direct translation in the target language
3. DO NOT use translations from other languages
4. DO NOT include explanations or alternatives
5. DO NOT wrap the translation in quotes
6. DO NOT add any additional text
7. Maintain cultural appropriateness for ${targetLanguage}
Example format: if input is "Email" and target is Urdu, output only "ای میل"`,
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

            let translatedText = parsed.choices?.[0]?.message?.content?.trim();

            // Clean up the response
            if (translatedText) {
              // Remove quotes if present
              translatedText = translatedText.replace(/^["']|["']$/g, "");

              // Take only the first line if multiple lines exist
              translatedText = translatedText.split("\n")[0];

              // Remove any explanatory text after punctuation
              translatedText = translatedText.split(/[.,;:]/)[0].trim();
            }
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
    return "OpenAI";
  }

  getModel(): string {
    return this.model;
  }
}

export class TranslationProviderManager {
  private providers: Map<string, TranslationProvider>;
  private currentProvider: string | undefined;
  private static instance: TranslationProviderManager;

  private constructor() {
    this.providers = new Map();
  }

  static getInstance(): TranslationProviderManager {
    if (!TranslationProviderManager.instance) {
      TranslationProviderManager.instance = new TranslationProviderManager();
    }
    return TranslationProviderManager.instance;
  }

  registerProvider(id: string, provider: TranslationProvider) {
    this.providers.set(id, provider);
    // Set as current provider if none is set
    if (!this.currentProvider) {
      this.currentProvider = id;
    }
  }

  unregisterProvider(id: string) {
    if (this.currentProvider === id) {
      this.currentProvider = undefined;
    }
    this.providers.delete(id);
  }

  async setCurrentProvider(id: string) {
    if (!this.providers.has(id)) {
      throw new Error(`Translation provider '${id}' not found`);
    }

    const provider = this.providers.get(id)!;
    if (await provider.isAvailable()) {
      this.currentProvider = id;
      // Update configuration
      const config = vscode.workspace.getConfiguration("getx-locale");
      await config.update("translationProvider", id, true);
    } else {
      throw new Error(`Translation provider '${id}' is not available`);
    }
  }

  getCurrentProvider(): TranslationProvider {
    const provider = this.providers.get(this.currentProvider!);
    if (!provider) {
      throw new Error(
        "No translation provider configured. Please configure a provider in settings."
      );
    }
    return provider;
  }

  async translate(text: string, targetLanguage: string): Promise<string> {
    if (!this.currentProvider || !this.providers.has(this.currentProvider)) {
      throw new Error(
        "No translation provider configured. Please configure a provider first."
      );
    }

    const provider = this.getCurrentProvider();
    try {
      return await provider.translate(text, targetLanguage);
    } catch (error) {
      // If current provider fails, try fallback to another available provider
      for (const [id, p] of this.providers.entries()) {
        if (id !== this.currentProvider && (await p.isAvailable())) {
          try {
            this.currentProvider = id; // Switch to working provider
            console.log(`Switched to provider: ${id} (${p.getModel()})`);
            return await p.translate(text, targetLanguage);
          } catch (e) {
            console.error(`Fallback provider ${id} failed:`, e);
            continue; // Try next provider if available
          }
        }
      }
      throw error; // Re-throw if no provider succeeds
    }
  }

  getAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  async getCurrentProviderName(): Promise<string> {
    const provider = this.getCurrentProvider();
    return `${provider.getName()} (${provider.getModel()})`;
  }
}
