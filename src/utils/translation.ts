import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import {
  TranslationProviderManager,
  OpenAITranslationProvider,
} from "../api/translation-provider";
import { GroqTranslationProvider, getGroqApiKey } from "../api/groq-provider";
import {
  getOpenAIApiKey,
  setupOpenAIApiKey,
  setupGroqApiKey,
  showApiKeySetupDialog,
} from "./api-key";

// Add missing type for file objects
interface FileSystemPath {
  fsPath: string;
}

export async function initializeTranslationProviders(
  context: vscode.ExtensionContext
): Promise<void> {
  const manager = TranslationProviderManager.getInstance();
  const providers = manager.getAvailableProviders();

  // Clear any existing providers to start fresh
  for (const id of providers) {
    manager.unregisterProvider(id);
  }

  // Add providers if API keys exist
  const openaiKey = await getOpenAIApiKey(context);
  if (openaiKey) {
    manager.registerProvider(
      "openai",
      new OpenAITranslationProvider(openaiKey)
    );
    console.log("OpenAI provider registered");
  }

  const groqKey = await getGroqApiKey(context);
  if (groqKey) {
    manager.registerProvider("groq", new GroqTranslationProvider(groqKey));
    console.log("Groq provider registered");
  }

  // Set the provider based on configuration or availability
  const config = vscode.workspace.getConfiguration("getx-locale");
  const preferredProvider = config.get<string>("translationProvider");

  const availableProviders = manager.getAvailableProviders();
  if (availableProviders.length === 0) {
    console.log("No providers available, showing setup dialog");
    await setupTranslationProvider(context);
    return;
  }

  try {
    if (preferredProvider && availableProviders.includes(preferredProvider)) {
      await manager.setCurrentProvider(preferredProvider);
      console.log(`Using configured provider: ${preferredProvider}`);
    } else {
      // Use any available provider
      await manager.setCurrentProvider(availableProviders[0]);
      console.log(`Using default provider: ${availableProviders[0]}`);
    }
  } catch (error) {
    console.error("Failed to initialize provider:", error);
    throw new Error(
      "Failed to initialize translation provider. Please configure a provider."
    );
  }
}

export async function setupTranslationProvider(
  context: vscode.ExtensionContext
): Promise<boolean> {
  const choice = await showApiKeySetupDialog();

  if (choice === "Configure OpenAI") {
    await setupOpenAIApiKey(context);
    const apiKey = await getOpenAIApiKey(context);
    if (apiKey) {
      const manager = TranslationProviderManager.getInstance();
      manager.registerProvider("openai", new OpenAITranslationProvider(apiKey));
      await manager.setCurrentProvider("openai");
      return true;
    }
  } else if (choice === "Configure Groq") {
    await setupGroqApiKey(context);
    const apiKey = await getGroqApiKey(context);
    if (apiKey) {
      const manager = TranslationProviderManager.getInstance();
      manager.registerProvider("groq", new GroqTranslationProvider(apiKey));
      await manager.setCurrentProvider("groq");
      return true;
    }
  }

  return false;
}

export async function switchTranslationProvider(
  context: vscode.ExtensionContext
): Promise<void> {
  const manager = TranslationProviderManager.getInstance();
  const availableProviders = manager.getAvailableProviders();

  if (availableProviders.length === 0) {
    await setupTranslationProvider(context);
    return;
  }

  async function getProviderDetails(id: string) {
    const currentName = await manager.getCurrentProviderName();
    const currentProvider = manager.getCurrentProvider();
    return {
      label: id === "openai" ? "OpenAI" : "Groq",
      description: id === currentName ? "Current" : "",
      detail: `Model: ${currentProvider.getModel()}`,
      id: id,
    };
  }

  const items = await Promise.all(availableProviders.map(getProviderDetails));

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: "Select Translation Provider",
  });

  if (selected) {
    try {
      await manager.setCurrentProvider(selected.id);
      vscode.window.showInformationMessage(
        `✓ Now using ${selected.label} for translations`
      );
    } catch (error: any) {
      vscode.window.showErrorMessage(
        `Failed to switch provider: ${error.message}`
      );
    }
  }
}

export async function findTranslationFiles(
  workspacePath: string
): Promise<string[]> {
  const files: string[] = [];

  const patterns = [
    "**/lib/**/translations/*.dart",
    "**/lib/**/translation/*.dart",
    "**/lib/**/localization/*.dart",
    "**/lib/**/locale/*.dart",
    "**/lib/**/lang/*.dart",
  ];

  for (const pattern of patterns) {
    const foundFiles = await vscode.workspace.findFiles(pattern);
    files.push(...foundFiles.map((f: FileSystemPath) => f.fsPath));
  }

  const localePattern = /([a-z]{2}_[A-Z]{2}|[a-z]{2})\.dart$/;
  return files.filter((file: string) => {
    const fileName = path.basename(file);
    return localePattern.test(fileName);
  });
}

export async function scanProjectForKeys(
  workspacePath: string
): Promise<string[]> {
  const dartFiles = await vscode.workspace.findFiles("**/*.dart");
  const allKeys: string[] = [];

  for (const file of dartFiles) {
    const content = fs.readFileSync(file.fsPath, "utf8");
    const trRegex = /["']([^"']+)["']\.tr/g;
    let match;

    while ((match = trRegex.exec(content)) !== null) {
      const key = match[1];
      if (!allKeys.includes(key)) {
        allKeys.push(key);
      }
    }
  }

  return allKeys;
}

export async function addKeysWithTranslation(
  context: vscode.ExtensionContext,
  translationFiles: string[],
  keys: string[]
): Promise<void> {
  await initializeTranslationProviders(context);
  const manager = TranslationProviderManager.getInstance();

  if (manager.getAvailableProviders().length === 0) {
    const setupSuccess = await setupTranslationProvider(context);
    if (!setupSuccess) {
      return;
    }
  }

  let addedCount = 0;
  let errorCount = 0;

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "GetX Locale: Translating",
        cancellable: false,
      },
      async (progress) => {
        const increment = 100 / (translationFiles.length * keys.length);

        for (const file of translationFiles) {
          const provider = await manager.getCurrentProviderName();
          const fileName = path.basename(file);
          progress.report({
            message: `Using ${provider} for ${fileName}...`,
            increment,
          });

          try {
            const added = await addKeysToTranslationFile(file, keys, true);
            addedCount += added;
          } catch (error: any) {
            errorCount++;
            console.error(`Error processing ${file}:`, error);

            const currentProvider = await manager.getCurrentProviderName();
            const providers = manager.getAvailableProviders();
            const otherProvider = providers.find(
              (p: string) => p !== currentProvider
            );
            if (otherProvider) {
              try {
                await manager.setCurrentProvider(otherProvider);
                console.log(`Switched to provider: ${otherProvider}`);
              } catch (e) {
                console.error(`Failed to switch to ${otherProvider}:`, e);
                continue;
              }
            }
          }
        }
      }
    );

    if (addedCount > 0 || errorCount === 0) {
      const provider = await manager.getCurrentProviderName();
      vscode.window.showInformationMessage(
        `✅ Added and translated ${addedCount} new keys using ${provider} to ${translationFiles.length} translation files` +
          (errorCount > 0 ? ` (${errorCount} files had errors)` : "")
      );
    } else {
      throw new Error("Failed to add any translations");
    }
  } catch (error: any) {
    vscode.window
      .showErrorMessage(
        `Failed to translate keys: ${error.message}`,
        "Switch Provider",
        "Proceed Without Translation"
      )
      .then((choice: string | undefined) => {
        if (choice === "Switch Provider") {
          switchTranslationProvider(context).then(() => {
            addKeysWithTranslation(context, translationFiles, keys);
          });
        } else if (choice === "Proceed Without Translation") {
          addKeysWithoutTranslation(translationFiles, keys);
        }
      });
  }
}

export async function addKeysWithoutTranslation(
  translationFiles: string[],
  keys: string[]
): Promise<void> {
  let addedCount = 0;
  for (const file of translationFiles) {
    const added = await addKeysToTranslationFile(file, keys, false);
    addedCount += added;
  }
  vscode.window.showInformationMessage(
    `Added ${addedCount} new keys to ${translationFiles.length} translation files (without translation)`
  );
}

export async function addKeysToTranslationFile(
  filePath: string,
  keys: string[],
  useTranslation: boolean = false
): Promise<number> {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    let addedCount = 0;

    const locale = getLocaleFromFilename(filePath);
    const existingKeys = extractExistingKeys(content);

    const mapRegex = /Map<String,\s*String>\s+\w+\s*=\s*{([^}]*)}/s;
    const mapMatch = content.match(mapRegex);

    if (!mapMatch) {
      vscode.window.showErrorMessage(
        `Could not find translation map in ${path.basename(filePath)}`
      );
      return 0;
    }

    const newKeys: string[] = [];
    for (const key of keys) {
      if (!existingKeys.includes(key)) {
        newKeys.push(key);
        addedCount++;
      }
    }

    if (newKeys.length === 0) {
      return 0;
    }

    const newEntries: string[] = [];
    const manager = TranslationProviderManager.getInstance();

    if (useTranslation && locale !== "en_US" && locale !== "en") {
      const batchSize = 2; // Process two keys at a time
      for (let i = 0; i < newKeys.length; i += batchSize) {
        const batch = newKeys.slice(i, i + batchSize);
        const translations: { [key: string]: string } = {};

        // Process batch with retries
        for (const key of batch) {
          try {
            translations[key] = await translateText(key, locale, manager);
          } catch (error: any) {
            console.error(`[Translation] Failed to translate "${key}":`, error);
            if (error.statusCode === 400 || error.statusCode === 429) {
              // Wait longer for rate limits
              await new Promise((resolve) => setTimeout(resolve, 2000));
              try {
                translations[key] = await translateText(key, locale, manager);
              } catch (retryError) {
                console.error(
                  `[Translation] Retry failed for "${key}":`,
                  retryError
                );
                translations[key] = key; // Fallback to original key
              }
            } else {
              translations[key] = key; // Fallback to original key
            }
          }
        }

        // Add translated entries
        for (const key of batch) {
          newEntries.push(`  "${key}": "${translations[key] || key}"`);
        }

        // Wait between batches to avoid rate limits
        if (i + batchSize < newKeys.length) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
    } else {
      // For English, just use keys as-is
      for (const key of newKeys) {
        newEntries.push(`  "${key}": "${key}"`);
      }
    }

    const newEntriesStr = newEntries.join(",\n");
    const mapContent = mapMatch[1];
    const hasExistingEntries = mapContent.trim().length > 0;

    let updatedContent;
    if (hasExistingEntries) {
      updatedContent = content.replace(mapRegex, (match: string, p1: string) =>
        match.replace(p1, p1 + ",\n" + newEntriesStr + "\n")
      );
    } else {
      updatedContent = content.replace(mapRegex, (match: string, p1: string) =>
        match.replace(p1, "\n" + newEntriesStr + "\n")
      );
    }

    fs.writeFileSync(filePath, updatedContent, "utf8");
    return addedCount;
  } catch (error) {
    vscode.window.showErrorMessage(
      `Error updating ${path.basename(filePath)}: ${error}`
    );
    return 0;
  }
}

export function extractExistingKeys(content: string): string[] {
  const keys: string[] = [];
  const keyRegex = /["']([^"']+)["']\s*:\s*["'][^"']*["']/g;
  let match;

  while ((match = keyRegex.exec(content)) !== null) {
    keys.push(match[1]);
  }

  return keys;
}

function getLanguageFromLocale(locale: string): string {
  console.log(`[Language Mapping] Input locale: ${locale}`);

  const languageMap: { [key: string]: string } = {
    ur_PK: "Urdu",
    id_ID: "Indonesian (Bahasa Indonesia)", // More specific language name
    en_US: "English",
    en: "English",
    ar_SA: "Arabic",
    zh_CN: "Chinese (Simplified)",
    hi_IN: "Hindi",
  };

  // Split locale code to get language code
  const langCode = locale.split("_")[0];
  const fallbackMap: { [key: string]: string } = {
    ur: "Urdu",
    id: "Indonesian (Bahasa Indonesia)", // More specific language name
    en: "English",
    ar: "Arabic",
    zh: "Chinese",
    hi: "Hindi",
  };

  const language = languageMap[locale] || fallbackMap[langCode] || locale;
  console.log(`[Language Mapping] Mapped to: ${language}`);
  return language;
}

export function getLocaleFromFilename(filePath: string): string {
  const fileName = path.basename(filePath, ".dart");
  return fileName;
}

// Translation cache to avoid duplicate API calls
const translationCache: { [key: string]: string } = {};

export async function translateText(
  text: string,
  locale: string,
  manager: TranslationProviderManager
): Promise<string> {
  // Check cache first
  const cacheKey = `${text}:${locale}`;
  if (translationCache[cacheKey]) {
    console.log(`[Translation] Cache hit for "${text}" in ${locale}`);
    return translationCache[cacheKey];
  }

  const targetLanguage = getLanguageFromLocale(locale);

  try {
    // Increased delay between requests
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const translation = await manager.translate(text, targetLanguage);

    if (!translation || translation.trim().length === 0) {
      throw new Error(`Empty translation received for "${text}"`);
    }

    // Cache the successful translation
    translationCache[cacheKey] = translation;
    return translation;
  } catch (error: any) {
    if (error.statusCode === 400) {
      console.log(`[Translation] API error for "${text}", using original text`);
      return text;
    }
    if (error.statusCode === 429) {
      console.log(`[Translation] Rate limit hit, waiting 5 seconds...`);
      await new Promise((resolve) => setTimeout(resolve, 5000));
      return translateText(text, locale, manager); // Retry once after delay
    }
    throw error;
  }
}

// Add this function to handle batch translations
export async function translateBatch(
  texts: string[],
  locale: string,
  manager: TranslationProviderManager
): Promise<{ [key: string]: string }> {
  const results: { [key: string]: string } = {};
  const batchSize = 2;

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    await Promise.all(
      batch.map(async (text) => {
        try {
          results[text] = await translateText(text, locale, manager);
        } catch (error) {
          console.error(`Failed to translate "${text}":`, error);
          results[text] = text;
        }
      })
    );
    // Wait between batches to avoid rate limits
    if (i + batchSize < texts.length) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  return results;
}
