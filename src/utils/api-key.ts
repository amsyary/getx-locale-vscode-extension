import * as vscode from "vscode";
import { translateWithOpenAI } from "../api/openai";
import {
  GroqTranslationProvider,
  testGroqApiKey,
  getGroqApiKey,
  setGroqApiKey,
  deleteGroqApiKey,
} from "../api/groq-provider";

const OPENAI_API_KEY_SECRET = "getx-locale.openai-api-key";

export async function getOpenAIApiKey(
  context: vscode.ExtensionContext
): Promise<string | undefined> {
  return await context.secrets.get(OPENAI_API_KEY_SECRET);
}

export async function setOpenAIApiKey(
  context: vscode.ExtensionContext,
  apiKey: string
): Promise<void> {
  // Validate API key format
  if (!apiKey.startsWith("sk-")) {
    throw new Error(
      'Invalid API key format. OpenAI API keys must start with "sk-"'
    );
  }

  if (apiKey.length < 40) {
    throw new Error(
      "Invalid API key length. OpenAI API keys should be at least 40 characters long"
    );
  }

  try {
    // Store the key first
    await context.secrets.store(OPENAI_API_KEY_SECRET, apiKey);

    // Verify the key works by attempting a simple translation
    vscode.window.showInformationMessage("Verifying API key...");
    await translateWithOpenAI("test", "English", apiKey);
  } catch (error: any) {
    // If verification fails, delete the stored key
    await context.secrets.delete(OPENAI_API_KEY_SECRET);

    if (error.code === "invalid_api_key") {
      throw new Error("Invalid API key. The key was not accepted by OpenAI.");
    } else if (error.code === "insufficient_quota") {
      throw new Error(
        "Your OpenAI account has insufficient quota. Please check your billing settings."
      );
    } else {
      throw new Error(`Failed to verify API key: ${error.message || error}`);
    }
  }
}

export async function deleteOpenAIApiKey(
  context: vscode.ExtensionContext
): Promise<void> {
  await context.secrets.delete(OPENAI_API_KEY_SECRET);
}

export async function showApiKeySetupDialog(): Promise<string | undefined> {
  const message = `API Provider Setup

You can use multiple providers for translations:

OpenAI:
- Fast and reliable translations
- Cost: ~$0.001-0.002 per translation

Groq:
- Uses Mixtral model
- Alternative pricing

Which provider would you like to configure?`;

  return await vscode.window.showInformationMessage(
    message,
    { modal: true },
    "Configure OpenAI",
    "Configure Groq"
  );
}

export async function setupOpenAIApiKey(
  context: vscode.ExtensionContext
): Promise<void> {
  const apiKey = await vscode.window.showInputBox({
    prompt: "Enter your OpenAI API Key",
    placeHolder: "sk-...",
    password: true,
    ignoreFocusOut: true,
    validateInput: (value: string) => {
      if (!value) {
        return "API Key cannot be empty";
      }
      if (!value.startsWith("sk-")) {
        return 'OpenAI API Key should start with "sk-"';
      }
      if (value.length < 40) {
        return "API Key seems too short. OpenAI API keys are typically longer than 40 characters.";
      }
      return null;
    },
  });

  if (apiKey) {
    try {
      await setOpenAIApiKey(context, apiKey);
      vscode.window.showInformationMessage(
        "✅ OpenAI API Key verified and saved successfully!"
      );
    } catch (error: any) {
      vscode.window.showErrorMessage(
        `❌ ${error.message}\n\nPlease check your API key and try again.`
      );
    }
  }
}

async function configureGroqKey(
  context: vscode.ExtensionContext
): Promise<void> {
  const apiKey = await vscode.window.showInputBox({
    prompt: "Enter your Groq API Key",
    placeHolder: "gsk_...",
    password: true,
    ignoreFocusOut: true,
    validateInput: (value: string) => {
      if (!value) {
        return "API Key cannot be empty";
      }
      if (!value.startsWith("gsk_")) {
        return 'Groq API Key should start with "gsk_"';
      }
      return null;
    },
  });

  if (apiKey) {
    try {
      await setGroqApiKey(context, apiKey);
      vscode.window.showInformationMessage(
        "✅ Groq API Key verified and saved successfully!"
      );
    } catch (error: any) {
      vscode.window.showErrorMessage(
        `❌ ${error.message}\n\nPlease check your API key and try again.`
      );
    }
  }
}

async function showAPIKeyStatus(
  context: vscode.ExtensionContext
): Promise<void> {
  const openaiKey = await getOpenAIApiKey(context);
  const groqKey = await getGroqApiKey(context);

  const statusMessage = [
    "API Key Status:",
    `OpenAI: ${openaiKey ? "✓ Configured" : "✗ Not Configured"}`,
    `Groq: ${groqKey ? "✓ Configured" : "✗ Not Configured"}`,
    "",
    "Use 'Configure API Key' options to manage keys.",
  ].join("\n");

  const action = await vscode.window.showInformationMessage(
    statusMessage,
    "Configure OpenAI",
    "Configure Groq",
    "Test Keys"
  );

  if (action === "Configure OpenAI") {
    await setupOpenAIApiKey(context);
  } else if (action === "Configure Groq") {
    await configureGroqKey(context);
  } else if (action === "Test Keys") {
    if (openaiKey) {
      await translateWithOpenAI("test", "English", openaiKey)
        .then(() =>
          vscode.window.showInformationMessage("✅ OpenAI API Key is working")
        )
        .catch((error) =>
          vscode.window.showErrorMessage(
            `❌ OpenAI API Key error: ${error.message}`
          )
        );
    }
    if (groqKey) {
      await testGroqApiKey(groqKey);
    }
  }
}

export async function manageAPIKeys(
  context: vscode.ExtensionContext
): Promise<void> {
  const options = [
    "Configure OpenAI API Key",
    "Configure Groq API Key",
    "View API Keys",
  ];

  const choice = await vscode.window.showQuickPick(options, {
    placeHolder: "Select API key to manage",
  });

  switch (choice) {
    case "Configure OpenAI API Key":
      await setupOpenAIApiKey(context);
      break;

    case "Configure Groq API Key":
      await configureGroqKey(context);
      break;

    case "View API Keys":
      await showAPIKeyStatus(context);
      break;
  }
}

// For backward compatibility
export const manageOpenAIApiKey = manageAPIKeys;

export { configureGroqKey as setupGroqApiKey };
