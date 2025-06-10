import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
export function activate(context: vscode.ExtensionContext) {
  // Command to extract and add translation keys
  let extractCommand = vscode.commands.registerCommand(
    "getx-locale.extractKeys",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showErrorMessage("No active editor found");
        return;
      }

      const document = editor.document;
      const text = document.getText();

      // Extract .tr keys using regex
      const trRegex = /["']([^"']+)["']\.tr/g;
      const keys: string[] = [];
      let match;

      while ((match = trRegex.exec(text)) !== null) {
        const key = match[1];
        if (!keys.includes(key)) {
          keys.push(key);
        }
      }

      if (keys.length === 0) {
        vscode.window.showInformationMessage(
          "No .tr keys found in current file"
        );
        return;
      }

      // Get workspace folder
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showErrorMessage("No workspace folder found");
        return;
      }

      // Find translation files
      const translationFiles = await findTranslationFiles(
        workspaceFolder.uri.fsPath
      );

      if (translationFiles.length === 0) {
        vscode.window.showErrorMessage(
          "No translation files found. Make sure you have files like en_US.dart, pt_BR.dart in your project"
        );
        return;
      }

      // Add keys to translation files
      let addedCount = 0;
      for (const file of translationFiles) {
        const added = await addKeysToTranslationFile(file, keys);
        addedCount += added;
      }

      vscode.window.showInformationMessage(
        `Added ${addedCount} new keys to ${translationFiles.length} translation files`
      );
    }
  );

  // Command to scan entire project
  let scanProjectCommand = vscode.commands.registerCommand(
    "getx-locale.scanProject",
    async () => {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        vscode.window.showErrorMessage("No workspace folder found");
        return;
      }

      const allKeys = await scanProjectForKeys(workspaceFolder.uri.fsPath);
      const translationFiles = await findTranslationFiles(
        workspaceFolder.uri.fsPath
      );

      if (translationFiles.length === 0) {
        vscode.window.showErrorMessage("No translation files found");
        return;
      }

      let addedCount = 0;
      for (const file of translationFiles) {
        const added = await addKeysToTranslationFile(file, allKeys);
        addedCount += added;
      }

      vscode.window.showInformationMessage(
        `Scanned project and added ${addedCount} new keys to ${translationFiles.length} translation files`
      );
    }
  );

  context.subscriptions.push(extractCommand);
  context.subscriptions.push(scanProjectCommand);
}

async function findTranslationFiles(workspacePath: string): Promise<string[]> {
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

async function scanProjectForKeys(workspacePath: string): Promise<string[]> {
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
async function addKeysToTranslationFile(
  filePath: string,
  keys: string[]
): Promise<number> {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    let addedCount = 0;

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
    const newEntries = newKeys.map((key) => `  "${key}": "${key}"`).join(",\n");

    // Find the position to insert new keys (before the closing brace)
    const mapContent = mapMatch[1];
    const hasExistingEntries = mapContent.trim().length > 0;

    let updatedContent;
    if (hasExistingEntries) {
      // Add comma and new entries
      updatedContent = content.replace(mapRegex, (match, p1) =>
        match.replace(p1, p1 + ",\n" + newEntries + "\n")
      );
    } else {
      // First entries
      updatedContent = content.replace(mapRegex, (match, p1) =>
        match.replace(p1, "\n" + newEntries + "\n")
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

function extractExistingKeys(content: string): string[] {
  const keys: string[] = [];
  const keyRegex = /["']([^"']+)["']\s*:\s*["'][^"']*["']/g;
  let match;

  while ((match = keyRegex.exec(content)) !== null) {
    keys.push(match[1]);
  }

  return keys;
}

export function deactivate() {}
