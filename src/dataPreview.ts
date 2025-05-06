import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import * as Papa from 'papaparse';
import { detectFileType } from './utils';

export class DataPreviewPanel {
  public static currentPanel: DataPreviewPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private _disposables: vscode.Disposable[] = [];

  constructor(extensionUri: vscode.Uri) {
    this._extensionUri = extensionUri;
    this._panel = vscode.window.createWebviewPanel(
      'datamorphPreview',
      'DataMorph Preview',
      vscode.ViewColumn.Two,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')],
      }
    );

    // Initial content
    this._panel.webview.html = this._getWebviewContent('Loading...');

    // Listen for messages from the webview
    this._panel.webview.onDidReceiveMessage(
      message => {
        switch (message.command) {
          case 'alert':
            vscode.window.showErrorMessage(message.text);
            return;
        }
      },
      null,
      this._disposables
    );

    // Clean up resources when panel is closed
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
  }

  public static create(extensionUri: vscode.Uri): DataPreviewPanel {
    if (DataPreviewPanel.currentPanel) {
      // If we already have a panel, show it
      DataPreviewPanel.currentPanel._panel.reveal();
    } else {
      // Otherwise, create a new panel
      DataPreviewPanel.currentPanel = new DataPreviewPanel(extensionUri);
    }

    return DataPreviewPanel.currentPanel;
  }

  public async show(fileUri: vscode.Uri): Promise<void> {
    const fileType = detectFileType(fileUri.fsPath);
    const fileName = path.basename(fileUri.fsPath);

    this._panel.title = `DataMorph Preview: ${fileName}`;

    try {
      switch (fileType) {
        case 'csv':
          await this._showCsvPreview(fileUri);
          break;
        case 'json':
          await this._showJsonPreview(fileUri);
          break;
        case 'excel':
          await this._showExcelPreview(fileUri);
          break;
        default:
          this._panel.webview.html = this._getWebviewContent(
            `<div class="error">Unsupported file type: ${fileName}</div>`
          );
      }
    } catch (error) {
      this._panel.webview.html = this._getWebviewContent(
        `<div class="error">Error loading file: ${
          (error as Error).message
        }</div>`
      );
    }
  }

  private async _showCsvPreview(fileUri: vscode.Uri): Promise<void> {
    try {
      const csvContent = fs.readFileSync(fileUri.fsPath, 'utf8');

      // Parse CSV
      const results = await new Promise<Papa.ParseResult<any>>(
        (resolve, reject) => {
          interface ParseConfig {
            header: boolean;
            dynamicTyping: boolean;
            skipEmptyLines: boolean;
            complete: (results: Papa.ParseResult<unknown>) => void;
            error: (error: Papa.ParseError) => void;
          }

          Papa.parse<unknown>(csvContent, {
            header: true,
            dynamicTyping: true,
            skipEmptyLines: true,
            complete: (results: Papa.ParseResult<unknown>): void =>
              resolve(results),
            error: (error: Papa.ParseError): void => reject(error),
          } as ParseConfig);
        }
      );

      if (results.errors.length > 0) {
        throw new Error(`CSV parsing error: ${results.errors[0].message}`);
      }

      // Generate table HTML
      const tableHtml = this._generateTableHtml(
        results.data,
        results.meta.fields || []
      );

      // Set webview content
      this._panel.webview.html = this._getWebviewContent(`
        <h2>CSV Preview</h2>
        <div class="table-container">
          ${tableHtml}
        </div>
      `);
    } catch (error) {
      throw new Error(`Failed to preview CSV: ${(error as Error).message}`);
    }
  }

  private async _showJsonPreview(fileUri: vscode.Uri): Promise<void> {
    try {
      const jsonContent = fs.readFileSync(fileUri.fsPath, 'utf8');
      const jsonData = JSON.parse(jsonContent);

      if (Array.isArray(jsonData)) {
        // Array of objects - show as table
        if (jsonData.length > 0 && typeof jsonData[0] === 'object') {
          // Get all unique keys from all objects in the array
          const allKeys = new Set<string>();
          jsonData.forEach(item => {
            if (typeof item === 'object' && item !== null) {
              Object.keys(item).forEach(key => allKeys.add(key));
            }
          });

          const tableHtml = this._generateTableHtml(
            jsonData,
            Array.from(allKeys)
          );

          this._panel.webview.html = this._getWebviewContent(`
            <h2>JSON Array Preview</h2>
            <div class="table-container">
              ${tableHtml}
            </div>
            <div class="json-tree-view">
              <h3>JSON Tree View</h3>
              <pre class="json-tree">${this._formatJsonHtml(jsonData)}</pre>
            </div>
          `);
        } else {
          // Simple array - show as tree
          this._panel.webview.html = this._getWebviewContent(`
            <h2>JSON Preview</h2>
            <div class="json-tree-view">
              <pre class="json-tree">${this._formatJsonHtml(jsonData)}</pre>
            </div>
          `);
        }
      } else if (typeof jsonData === 'object' && jsonData !== null) {
        // Object - show as tree
        this._panel.webview.html = this._getWebviewContent(`
          <h2>JSON Preview</h2>
          <div class="json-tree-view">
            <pre class="json-tree">${this._formatJsonHtml(jsonData)}</pre>
          </div>
        `);
      } else {
        // Primitive value
        this._panel.webview.html = this._getWebviewContent(`
          <h2>JSON Preview</h2>
          <div class="json-tree-view">
            <pre class="json-tree">${JSON.stringify(jsonData, null, 2)}</pre>
          </div>
        `);
      }
    } catch (error) {
      throw new Error(`Failed to preview JSON: ${(error as Error).message}`);
    }
  }

  private async _showExcelPreview(fileUri: vscode.Uri): Promise<void> {
    try {
      // Read Excel file
      const workbook = XLSX.readFile(fileUri.fsPath);

      // Get sheet names
      const sheetNames = workbook.SheetNames;

      // Generate HTML for all sheets
      const sheetsHtml = sheetNames
        .map(sheetName => {
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, {
            defval: null,
          });

          if (jsonData.length === 0) {
            return `
            <div class="sheet">
              <h3>Sheet: ${sheetName}</h3>
              <p>Empty sheet</p>
            </div>
          `;
          }

          // Get headers from the first object
          const headers = Object.keys(jsonData[0] as object);

          // Generate table for this sheet
          const tableHtml = this._generateTableHtml(jsonData, headers);

          return `
          <div class="sheet">
            <h3>Sheet: ${sheetName}</h3>
            <div class="table-container">
              ${tableHtml}
            </div>
          </div>
        `;
        })
        .join('');

      // Set webview content
      this._panel.webview.html = this._getWebviewContent(`
        <h2>Excel Preview</h2>
        ${sheetsHtml}
      `);
    } catch (error) {
      throw new Error(`Failed to preview Excel: ${(error as Error).message}`);
    }
  }

  private _generateTableHtml(data: any[], headers: string[]): string {
    if (data.length === 0) {
      return '<p>No data available</p>';
    }

    // Generate header row
    const headerRow = headers
      .map(header => `<th>${this._escapeHtml(header)}</th>`)
      .join('');

    // Generate data rows
    const dataRows = data
      .map(row => {
        const cells = headers
          .map(header => {
            let cellValue = row[header];

            // Handle special cases
            if (cellValue === null || cellValue === undefined) {
              cellValue = '';
            } else if (typeof cellValue === 'object') {
              cellValue = JSON.stringify(cellValue);
            }

            return `<td>${this._escapeHtml(String(cellValue))}</td>`;
          })
          .join('');

        return `<tr>${cells}</tr>`;
      })
      .join('');

    return `
      <table class="data-table">
        <thead>
          <tr>${headerRow}</tr>
        </thead>
        <tbody>
          ${dataRows}
        </tbody>
      </table>
    `;
  }

  private _formatJsonHtml(json: any): string {
    return this._escapeHtml(JSON.stringify(json, null, 2));
  }

  private _escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private _getWebviewContent(body: string): string {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Data Preview</title>
        <style>
          body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-editor-foreground);
            background-color: var(--vscode-editor-background);
          }

          .table-container {
            overflow-x: auto;
            margin-bottom: 20px;
          }

          table.data-table {
            border-collapse: collapse;
            width: 100%;
            margin-bottom: 20px;
          }

          .data-table th, .data-table td {
            border: 1px solid var(--vscode-panel-border);
            padding: 8px;
            text-align: left;
          }

          .data-table th {
            background-color: var(--vscode-editor-selectionBackground);
            color: var(--vscode-editor-selectionForeground);
          }

          .data-table tr:nth-child(even) {
            background-color: var(--vscode-list-hoverBackground);
          }

          .json-tree-view {
            margin-top: 20px;
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            padding: 10px;
            border-radius: 4px;
            overflow-x: auto;
          }

          .json-tree {
            font-family: monospace;
            white-space: pre;
          }

          .error {
            color: var(--vscode-errorForeground);
            padding: 10px;
            border: 1px solid var(--vscode-errorForeground);
            border-radius: 4px;
          }

          .sheet {
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 1px solid var(--vscode-panel-border);
          }
        </style>
      </head>
      <body>
        ${body}
      </body>
      </html>
    `;
  }

  public dispose() {
    DataPreviewPanel.currentPanel = undefined;

    this._panel.dispose();

    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}
