import * as vscode from "vscode";
import { registerCommands } from "./commands";
import { initializeTranslationProviders } from "./utils/translation";

export async function activate(context: vscode.ExtensionContext) {
  console.log("Activating GetX Locale extension...");

  try {
    // Initialize translation providers first
    await initializeTranslationProviders(context);
    console.log("Translation providers initialized");
  } catch (error) {
    console.error("Error initializing translation providers:", error);
  }

  // Register commands
  registerCommands(context);
  console.log("GetX Locale extension activated");
}

export function deactivate() {}
