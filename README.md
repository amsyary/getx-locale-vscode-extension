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