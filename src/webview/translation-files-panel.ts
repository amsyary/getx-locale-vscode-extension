import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";

export class TranslationFilesPanel {
  public static currentPanel: TranslationFilesPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private _disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly targetFolder: vscode.Uri,
    private readonly extensionUri: vscode.Uri
  ) {
    this._panel = panel;
    this._update();

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage(
      this._handleMessage.bind(this),
      null,
      this._disposables
    );
  }

  public static async createOrShow(
    targetFolder: vscode.Uri,
    extensionUri: vscode.Uri
  ) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (TranslationFilesPanel.currentPanel) {
      TranslationFilesPanel.currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      "translationFiles",
      "Create Translation Files",
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        localResourceRoots: [extensionUri],
      }
    );

    TranslationFilesPanel.currentPanel = new TranslationFilesPanel(
      panel,
      targetFolder,
      extensionUri
    );
  }

  private _handleMessage(message: any) {
    switch (message.command) {
      case "createFiles":
        this._createTranslationFiles(message.languages);
        return;
    }
  }

  private async _createTranslationFiles(languages: string[]) {
    const enUsPath = path.join(this.targetFolder.fsPath, "en_US.dart");

    if (!fs.existsSync(enUsPath)) {
      vscode.window.showErrorMessage(
        "en_US.dart not found in the selected folder. Please create it first."
      );
      return;
    }

    const enUsContent = fs.readFileSync(enUsPath, "utf8");
    let filesCreated = 0;

    for (const lang of languages) {
      const filePath = path.join(this.targetFolder.fsPath, `${lang}.dart`);
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, enUsContent, "utf8");
        filesCreated++;
      }
    }

    vscode.window.showInformationMessage(
      `Created ${filesCreated} translation files. Edit them to add your translations.`
    );

    this._panel.dispose();
  }

  private _update() {
    this._panel.webview.html = this._getWebviewContent();
  }

  private _getWebviewContent() {
    const commonLanguages = [
      { code: "ar_SA", name: "Arabic (Saudi Arabia)" },
      { code: "bn_IN", name: "Bengali (India)" },
      { code: "zh_CN", name: "Chinese (Simplified)" },
      { code: "zh_TW", name: "Chinese (Traditional)" },
      { code: "cs_CZ", name: "Czech" },
      { code: "nl_NL", name: "Dutch" },
      { code: "fr_FR", name: "French" },
      { code: "de_DE", name: "German" },
      { code: "hi_IN", name: "Hindi" },
      { code: "id_ID", name: "Indonesian" },
      { code: "it_IT", name: "Italian" },
      { code: "ja_JP", name: "Japanese" },
      { code: "ko_KR", name: "Korean" },
      { code: "ms_MY", name: "Malay" },
      { code: "pl_PL", name: "Polish" },
      { code: "pt_BR", name: "Portuguese (Brazil)" },
      { code: "pt_PT", name: "Portuguese (Portugal)" },
      { code: "ru_RU", name: "Russian" },
      { code: "es_ES", name: "Spanish" },
      { code: "th_TH", name: "Thai" },
      { code: "tr_TR", name: "Turkish" },
      { code: "uk_UA", name: "Ukrainian" },
      { code: "ur_PK", name: "Urdu" },
      { code: "vi_VN", name: "Vietnamese" },
    ];

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body {
            padding: 15px;
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
          }
          .language-list {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
            gap: 10px;
            margin: 20px 0;
          }
          .language-item {
            display: flex;
            align-items: center;
            padding: 5px;
          }
          .language-item:hover {
            background-color: var(--vscode-list-hoverBackground);
          }
          .language-item input[type="checkbox"] {
            margin-right: 8px;
          }
          button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 16px;
            cursor: pointer;
            border-radius: 2px;
          }
          button:hover {
            background-color: var(--vscode-button-hoverBackground);
          }
          button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
          }
          .info {
            margin-bottom: 15px;
            color: var(--vscode-descriptionForeground);
          }
        </style>
      </head>
      <body>
        <div class="container">
          <p class="info">Select the language files you want to create. Each file will be created with content copied from en_US.dart.</p>
          <label class="language-item" style="margin-bottom: 15px; font-weight: bold;">
            <input type="checkbox" id="selectAll">
            Select All Languages
          </label>
          <div class="language-list">
            ${commonLanguages
              .map(
                (lang) => `
              <label class="language-item">
                <input type="checkbox" value="${lang.code}">
                ${lang.name} (${lang.code})
              </label>
            `
              )
              .join("")}
          </div>
          <button id="createButton" disabled>Create Selected Files</button>
        </div>

        <script>
          const vscode = acquireVsCodeApi();
          const selectAllCheckbox = document.getElementById('selectAll');
          const languageCheckboxes = document.querySelectorAll('.language-list input[type="checkbox"]');
          const createButton = document.getElementById('createButton');

          selectAllCheckbox.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            languageCheckboxes.forEach(cb => {
              cb.checked = isChecked;
            });
            updateButtonState();
          });

          // Update select all state when individual checkboxes change
          function updateSelectAllState() {
            const allChecked = Array.from(languageCheckboxes).every(cb => cb.checked);
            const someChecked = Array.from(languageCheckboxes).some(cb => cb.checked);
            selectAllCheckbox.checked = allChecked;
            selectAllCheckbox.indeterminate = someChecked && !allChecked;
          }

          function updateButtonState() {
            const checkedBoxes = document.querySelectorAll('.language-list input[type="checkbox"]:checked');
            createButton.disabled = checkedBoxes.length === 0;
            updateSelectAllState();
          }

          languageCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', updateButtonState);
          });

          createButton.addEventListener('click', () => {
            const selectedLanguages = Array.from(document.querySelectorAll('input[type="checkbox"]:checked'))
              .map(cb => cb.value);

            vscode.postMessage({
              command: 'createFiles',
              languages: selectedLanguages
            });
          });
        </script>
      </body>
      </html>
    `;
  }

  public dispose() {
    TranslationFilesPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}
