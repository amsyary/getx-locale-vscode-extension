import * as vscode from "vscode";
import {
  findTranslationFiles,
  scanProjectForKeys,
  addKeysWithTranslation,
  switchTranslationProvider,
} from "../utils/translation";
import { manageOpenAIApiKey } from "../utils/api-key";
import { TranslationFilesPanel } from "../webview/translation-files-panel";

export function registerCommands(context: vscode.ExtensionContext) {
  // Command to extract and add translation keys
  const extractCommand = vscode.commands.registerCommand(
    "getx-locale.extractKeys",
    async () => {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "GetX Locale: Extracting translations",
          cancellable: false,
        },
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
          await addKeysWithTranslation(context, translationFiles, keys);
        }
      );
    }
  );

  // Command to scan entire project
  const scanProjectCommand = vscode.commands.registerCommand(
    "getx-locale.scanProject",
    async () => {
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "GetX Locale: Scanning project for translations",
          cancellable: false,
        },
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

          await addKeysWithTranslation(context, translationFiles, allKeys);
        }
      );
    }
  );

  // Command to manage OpenAI API key
  const manageApiKeyCommand = vscode.commands.registerCommand(
    "getx-locale.manageApiKey",
    () => manageOpenAIApiKey(context)
  );

  // Command to switch translation provider
  const switchProviderCommand = vscode.commands.registerCommand(
    "getx-locale.switchProvider",
    () => switchTranslationProvider(context)
  );

  // Command to create translation files
  const createTranslationFilesCommand = vscode.commands.registerCommand(
    "getx-locale.createTranslationFiles",
    async (folder: vscode.Uri) => {
      if (!folder) {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
          vscode.window.showErrorMessage("No folder selected");
          return;
        }
        folder = workspaceFolder.uri;
      }

      await TranslationFilesPanel.createOrShow(folder, context.extensionUri);
    }
  );

  context.subscriptions.push(extractCommand);
  context.subscriptions.push(scanProjectCommand);
  context.subscriptions.push(manageApiKeyCommand);
  context.subscriptions.push(switchProviderCommand);
  context.subscriptions.push(createTranslationFilesCommand);
}
