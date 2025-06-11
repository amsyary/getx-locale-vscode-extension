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

// Cache and validation
const translationCache: { [key: string]: string } = {};
const englishTranslations: { [key: string]: string } = {};

// Type definitions
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

  // First process en_US.dart to use as base translations
  const enUsFile = translationFiles.find(
    (file) =>
      path.basename(file, ".dart") === "en_US" ||
      path.basename(file, ".dart") === "en"
  );

  if (enUsFile) {
    console.log("[Translation] Processing English translations first");
    const added = await addKeysToTranslationFile(enUsFile, keys, false);
    addedCount += added;

    // Store English translations for fallback
    const content = fs.readFileSync(enUsFile, "utf8");
    const matches = content.matchAll(
      /["']([^"']+)["']\s*:\s*["']([^"']+)["']/g
    );
    for (const match of matches) {
      englishTranslations[match[1]] = match[2];
    }

    // Remove en_US.dart from the list since we've processed it
    translationFiles = translationFiles.filter((f) => f !== enUsFile);
  }

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
            const translation = await translateText(key, locale, manager);

            // Validate translation and use English fallback if needed
            if (
              translation &&
              isValidTranslationForLocale(translation, locale)
            ) {
              translations[key] = translation;
              console.log(
                `[Translation] Successfully translated "${key}" to "${translation}"`
              );
            } else {
              translations[key] = englishTranslations[key] || key;
              console.log(
                `[Translation] Using fallback for "${key}": "${translations[key]}"`
              );
            }
          } catch (error: any) {
            if (error.statusCode === 429) {
              console.log("[Translation] Rate limit hit, waiting...");
              await new Promise((resolve) => setTimeout(resolve, 5000));
              try {
                const retryTranslation = await translateText(
                  key,
                  locale,
                  manager
                );
                if (
                  retryTranslation &&
                  isValidTranslationForLocale(retryTranslation, locale)
                ) {
                  translations[key] = retryTranslation;
                } else {
                  translations[key] = englishTranslations[key] || key;
                }
              } catch (retryError) {
                translations[key] = englishTranslations[key] || key;
              }
            } else {
              translations[key] = englishTranslations[key] || key;
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
      // For English, update translations cache and use as-is
      for (const key of newKeys) {
        englishTranslations[key] = key;
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

// Helper function to validate translations based on locale
function isValidTranslationForLocale(
  translation: string,
  locale: string
): boolean {
  if (!translation || translation.trim().length === 0) {
    return false;
  }

  // Language-specific validation
  switch (locale.split("_")[0]) {
    case "fr":
      // French should contain French-specific characters
      return /^[a-zàâäéèêëîïôöùûüÿçœæ\s''"-]+$/i.test(translation);
    case "ar":
      // Arabic should contain Arabic script
      return /[\u0600-\u06FF]/.test(translation);
    case "zh":
      // Chinese should contain Chinese characters
      return /[\u4E00-\u9FFF]/.test(translation);
    case "ur":
      // Urdu should contain Urdu script
      return /[\u0600-\u06FF]/.test(translation);
    case "pt":
      // Portuguese should contain Portuguese-specific characters
      return /^[a-záàâãéèêíìóòôõúùüçñ\s''"-]+$/i.test(translation);
    default:
      // For other languages, ensure it's not mixed with unexpected scripts
      return (
        !/[\u0600-\u06FF\u4E00-\u9FFF]/.test(translation) ||
        locale.startsWith(translation.slice(0, 2).toLowerCase())
      );
  }
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
    pt_BR: "Portuguese (Brazil)", // Added Brazilian Portuguese
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
    pt: "Portuguese", // Added Portuguese fallback
  };

  const language = languageMap[locale] || fallbackMap[langCode] || locale;
  console.log(`[Language Mapping] Mapped to: ${language}`);
  return language;
}

// Helper function to validate translations based on locale

export function getLocaleFromFilename(filePath: string): string {
  const fileName = path.basename(filePath, ".dart");
  return fileName;
}

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
    // Validate translation before caching
    if (isValidTranslationForLocale(translation, locale)) {
      translationCache[cacheKey] = translation;
      return translation;
    } else {
      console.log(
        `[Translation] Invalid translation detected for locale ${locale}, using English fallback`
      );
      return englishTranslations[text] || text;
    }
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
