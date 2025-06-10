# getx-locale README

This Extension is a tool to help manage GetX localization files.

## Features

Key Features:

1. Extract Keys from Current File: Scans the currently open Dart file for .tr keys and adds them to all translation files
2. Scan Entire Project: Scans all Dart files in your project for .tr keys and updates translation files
3. Smart Key Detection: Uses regex to find patterns like "your key".tr or 'your key'.tr
4. Multi-file Support: Automatically finds and updates all translation files (en_US.dart, pt_BR.dart, etc.)
5. Duplicate Prevention: Won't add keys that already exist in translation filesKey Features:

## Usage

1. Right-click in a Dart file → "Extract GetX Translation Keys from Current File"
2. Use keyboard shortcut: Ctrl+Shift+L (Windows/Linux) or Cmd+Shift+L (Mac)
3. Scan entire project: Right-click in Explorer → "Scan Entire Project for GetX Translation Keys"

## Folder Structure Patterns
The extension will look for translation files in the following patterns:
```
// Common patterns for translation files
  const patterns = [
    "**/lib/**/translations/*.dart",
    "**/lib/**/translation/*.dart",
    "**/lib/**/localization/*.dart",
    "**/lib/**/locale/*.dart",
    "**/lib/**/lang/*.dart",
  ];
```

you can customize these patterns in the `src/extension.ts` file if your project uses different folder structures.