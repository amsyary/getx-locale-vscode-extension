# GetX Locale Extension for VSCode

A VSCode extension to automatically extract and manage GetX localization keys with AI-powered translations.

## Features

- 🔍 Automatically extract `.tr` keys from Dart files
- 🌍 AI-powered translations using OpenAI or Groq
- 📝 Batch translation of multiple keys
- 🔄 Automatic provider fallback for reliability
- ⚡ Fast and accurate translations

## Translation Providers

### OpenAI
- Uses GPT-3.5 Turbo or GPT-4
- Highly accurate translations
- Requires OpenAI API key (starts with `sk-`)
- Cost: ~$0.001-0.002 per translation

### Groq
- Uses Llama 4 Scout (meta-llama/llama-4-scout-17b-16e-instruct)
- Fast inference speed
- Requires Groq API key (starts with `gsk_`)
- Alternative pricing model

## Setup

1. Install the extension from VSCode Marketplace

2. Configure your preferred translation provider:
   ```
   Command Palette (Ctrl/Cmd + Shift + P) → "GetX Locale: Manage Translation API Keys"
   ```
   Choose either:
   - Configure OpenAI: Enter your OpenAI API key
   - Configure Groq: Enter your Groq API key

3. (Optional) Configure provider settings in VSCode settings:
   ```json
   {
     "getx-locale.translationProvider": "openai" | "groq",
     "getx-locale.preferredModel": {
       "openai": "gpt-3.5-turbo" | "gpt-4",
       "groq": "meta-llama/llama-4-scout-17b-16e-instruct"
     }
   }
   ```

## Usage

### Extract Keys from Current File
1. Open a Dart file
2. Press `Ctrl/Cmd + Shift + L` or:
   ```
   Command Palette → "Extract GetX Translation Keys from Current File"
   ```
3. The extension will:
   - Find all `.tr` keys
   - Add them to translation files
   - Automatically translate using the configured provider

### Scan Entire Project
1. Right-click in Explorer or:
   ```
   Command Palette → "Scan Entire Project for GetX Translation Keys"
   ```
2. The extension will:
   - Scan all Dart files
   - Collect all `.tr` keys
   - Add and translate them in all translation files

### Switch Translation Provider
```
Command Palette → "Switch Translation Provider"
```
- Shows current provider and model
- Easily switch between OpenAI and Groq
- Automatic fallback if one provider fails

## Provider Details

### OpenAI Configuration
1. Get API key from: https://platform.openai.com/api-keys
2. Supported models:
   - `gpt-3.5-turbo` (default, faster)
   - `gpt-4` (more accurate, slower)

### Groq Configuration
1. Get API key from: https://console.groq.com/keys
2. Current model:
   - `meta-llama/llama-4-scout-17b-16e-instruct`
   - Optimized for translation tasks


## Build Locally
to build the extension locally:
```bash
npm run package
```

make sure you have install vsce package globally:
```bash
npm install -g vsce
```

then run the following command to publish the extension:
```bash
vsce package
```

then it will generate a `.vsix` file that you can install in VSCode.
and if you want to install it locally you can run the following command:
```bash
code --install-extension getx-locale-0.0.1.vsix
```

## Error Handling

The extension includes smart error handling:
- Automatic provider switching if one fails
- Clear error messages with troubleshooting steps
- Option to proceed without translation if needed

## Commands

| Command | Description | Keybinding |
|---------|-------------|------------|
| `getx-locale.extractKeys` | Extract keys from current file | `Ctrl/Cmd + Shift + L` |
| `getx-locale.scanProject` | Scan entire project for keys | - |
| `getx-locale.manageApiKey` | Manage translation API keys | - |
| `getx-locale.switchProvider` | Switch translation provider | - |

## Requirements

- VSCode 1.85.0 or higher
- Dart/Flutter project
- GetX localization setup
- API key for at least one provider

## Extension Settings

| Setting | Description | Default |
|---------|-------------|---------|
| `getx-locale.translationProvider` | Default translation provider | `"openai"` |
| `getx-locale.preferredModel.openai` | OpenAI model to use | `"gpt-3.5-turbo"` |
| `getx-locale.preferredModel.groq` | Groq model to use | `"meta-llama/llama-4-scout-17b-16e-instruct"` |

## Troubleshooting

### API Key Issues
- Ensure key format is correct (`sk-` for OpenAI, `gsk_` for Groq)
- Check API key validity in provider dashboard
- Verify billing status and quotas

### Translation Issues
- Check internet connection
- Try switching providers
- Verify target language code format
- Check rate limits

### Provider Switching
If a provider fails:
1. Extension attempts automatic fallback
2. Option to manually switch providers
3. Option to proceed without translation

## Contributing

This extension is open source. Contributions welcome!
- Report issues on GitHub
- Submit pull requests
- Suggest new features

## License

MIT License - see LICENSE file for details
