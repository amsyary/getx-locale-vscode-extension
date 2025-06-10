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

  // Common patterns for translation files
  const patterns = [
    "**/lib/**/translations/*.dart",
    "**/lib/**/translation/*.dart",
    "**/lib/**/localization/*.dart",
    "**/lib/**/locale/*.dart",
    "**/lib/**/lang/*.dart",
  ];

  for (const pattern of patterns) {
    const foundFiles = await vscode.workspace.findFiles(pattern);
    files.push(...foundFiles.map((f) => f.fsPath));
  }

  // Filter files that look like translation files (contain locale codes)
  const localePattern = /([a-z]{2}_[A-Z]{2}|[a-z]{2})\.dart$/;
  return files.filter((file) => {
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
  // Ensure providers are initialized
  await initializeTranslationProviders(context);
  const manager = TranslationProviderManager.getInstance();

  // If no provider is available or needs setup
  if (manager.getAvailableProviders().length === 0) {
    const setupSuccess = await setupTranslationProvider(context);
    if (!setupSuccess) {
      return; // User cancelled or setup failed
    }
  }

  const progress = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left
  );
  progress.show();
  let addedCount = 0;
  let errorCount = 0;

  try {
    for (const file of translationFiles) {
      const provider = await manager.getCurrentProviderName();
      progress.text = `$(sync~spin) Translating keys using ${provider} for ${path.basename(
        file
      )}...`;

      try {
        const added = await addKeysToTranslationFile(file, keys, true);
        addedCount += added;
      } catch (error: any) {
        errorCount++;
        console.error(`Error processing ${file}:`, error);

        // Try switching providers
        const currentProvider = await manager.getCurrentProviderName();
        const providers = manager.getAvailableProviders();
        const otherProvider = providers.find((p) => p !== currentProvider);
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
      .then((choice) => {
        if (choice === "Switch Provider") {
          switchTranslationProvider(context).then(() => {
            addKeysWithTranslation(context, translationFiles, keys);
          });
        } else if (choice === "Proceed Without Translation") {
          addKeysWithoutTranslation(translationFiles, keys);
        }
      });
  } finally {
    progress.dispose();
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

    // Get locale from filename
    const locale = getLocaleFromFilename(filePath);

    // Parse the existing keys from the file
    const existingKeys = extractExistingKeys(content);

    // Find the map declaration
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

    // Generate new key-value pairs
    const newEntries: string[] = [];
    const manager = TranslationProviderManager.getInstance();

    for (const key of newKeys) {
      let translation = key; // Default fallback

      if (useTranslation && locale !== "en_US" && locale !== "en") {
        try {
          // Add small delay to avoid rate limiting
          await new Promise((resolve) => setTimeout(resolve, 200));
          translation = await manager.translate(key, locale);
          console.log(`Translated "${key}" to "${translation}" for ${locale}`);
        } catch (error) {
          console.error(`Translation failed for "${key}":`, error);
          // Keep original key as fallback
        }
      }

      newEntries.push(`  "${key}": "${translation}"`);
    }

    const newEntriesStr = newEntries.join(",\n");

    // Find the position to insert new keys (before the closing brace)
    const mapContent = mapMatch[1];
    const hasExistingEntries = mapContent.trim().length > 0;

    let updatedContent;
    if (hasExistingEntries) {
      // Add comma and new entries
      updatedContent = content.replace(mapRegex, (match, p1) =>
        match.replace(p1, p1 + ",\n" + newEntriesStr + "\n")
      );
    } else {
      // First entries
      updatedContent = content.replace(mapRegex, (match, p1) =>
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

export function getLocaleFromFilename(filePath: string): string {
  const fileName = path.basename(filePath, ".dart");
  return fileName;
}
