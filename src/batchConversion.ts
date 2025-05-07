import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { detectFileType } from './utils';
import {
  selectYamlTransformFile,
  applyYamlTransformations,
  createYamlTransformTemplate,
} from './transformations';

interface FileConversionInfo {
  filePath: string;
  fileName: string;
  fileType: 'csv' | 'json' | 'excel' | 'unknown';
  selected: boolean;
}

interface ConversionOptions {
  targetFormat: 'csv' | 'json' | 'excel';
  preserveTypes: boolean;
  overwriteFiles: boolean;
  customTransformation?: string;
  yamlTransformationPath?: string;
}

export class BatchConversionProvider {
  public async showBatchConversion(folderUri: vscode.Uri): Promise<void> {
    const files = await this.getConvertibleFiles(folderUri);

    if (files.length === 0) {
      vscode.window.showInformationMessage(
        'No convertible files found in the selected folder.'
      );
      return;
    }

    // First, let user select target format
    const targetFormat = await vscode.window.showQuickPick(
      ['JSON', 'CSV', 'Excel (.xlsx)'],
      {
        placeHolder: 'Select target format for conversion',
      }
    );

    if (!targetFormat) {
      return; // User cancelled
    }

    // Convert display format to internal format
    const formatMapping: Record<string, 'json' | 'csv' | 'excel'> = {
      JSON: 'json',
      CSV: 'csv',
      'Excel (.xlsx)': 'excel',
    };

    const conversionOptions: ConversionOptions = {
      targetFormat: formatMapping[targetFormat],
      preserveTypes: vscode.workspace
        .getConfiguration('dataconverter')
        .get('preserveDataTypes', true),
      overwriteFiles: false,
    };

    // Show custom conversion dialog
    await this.showBatchConversionDialog(folderUri, files, conversionOptions);
  }

  private async showBatchConversionDialog(
    folderUri: vscode.Uri,
    files: FileConversionInfo[],
    options: ConversionOptions
  ): Promise<void> {
    // Create a webview panel
    const panel = vscode.window.createWebviewPanel(
      'datamorphBatchConversion',
      'DataMorph: Batch Convert',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
      }
    );

    // Set webview HTML
    panel.webview.html = this.getBatchConversionHtml(files, options);

    // Handle messages from the webview
    panel.webview.onDidReceiveMessage(async message => {
      switch (message.command) {
        case 'startConversion': {
          const selectedFiles = message.files as FileConversionInfo[];
          const options = message.options as ConversionOptions;

          // Validate custom transformation if provided
          if (
            options.customTransformation &&
            options.customTransformation.trim() !== ''
          ) {
            try {
              // Simple validation to check if it's valid JavaScript
              new Function('data', options.customTransformation);
            } catch (error) {
              vscode.window.showErrorMessage(
                `Invalid transformation script: ${(error as Error).message}`
              );
              return;
            }
          }

          await this.convertFiles(folderUri, selectedFiles, options);

          // Close panel after conversion
          panel.dispose();
          break;
        }
        case 'selectYamlFile': {
          const yamlFilePath = await selectYamlTransformFile();
          if (yamlFilePath) {
            panel.webview.postMessage({
              command: 'yamlFileSelected',
              path: yamlFilePath,
            });
          }
          break;
        }
        case 'createYamlTemplate': {
          const yamlFilePath = await createYamlTransformTemplate(
            folderUri.fsPath
          );
          if (yamlFilePath) {
            panel.webview.postMessage({
              command: 'yamlFileSelected',
              path: yamlFilePath,
            });

            // Open the new file in the editor
            const doc = await vscode.workspace.openTextDocument(yamlFilePath);
            await vscode.window.showTextDocument(doc);
          }
          break;
        }
        case 'cancel':
          panel.dispose();
          break;
      }
    });
  }

  private async convertFiles(
    folderUri: vscode.Uri,
    files: FileConversionInfo[],
    options: ConversionOptions
  ): Promise<void> {
    // Create progress indicator
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Converting files...',
        cancellable: true,
      },
      async (progress, token) => {
        const total = files.length;
        let completed = 0;
        let skipped = 0;
        let failed = 0;
        const errors: string[] = [];

        // Get batch size from configuration with default of 5
        const batchSize = vscode.workspace
          .getConfiguration('dataconverter')
          .get('batchProcessingSize', 5);

        // Track processing state
        let isPaused = false;
        let startTime = Date.now();

        // Process files in batches
        for (let i = 0; i < files.length; i++) {
          // Check for cancellation
          if (token.isCancellationRequested) {
            vscode.window.showInformationMessage('File conversion cancelled.');
            break;
          }

          // Handle paused state
          if (isPaused) {
            const resumeResponse = await vscode.window.showInformationMessage(
              'Conversion is paused. Would you like to resume?',
              'Resume',
              'Cancel'
            );

            if (resumeResponse === 'Resume') {
              isPaused = false;
            } else {
              vscode.window.showInformationMessage(
                'File conversion cancelled.'
              );
              break;
            }
          }

          const file = files[i];

          // Calculate and display ETA and speed statistics
          const elapsedMs = Date.now() - startTime;
          const filesPerSecond =
            i > 0 ? (i / (elapsedMs / 1000)).toFixed(2) : '0.00';
          const remainingFiles = total - i;
          const estimatedSecondsRemaining =
            i > 0 ? Math.round(remainingFiles / (i / (elapsedMs / 1000))) : 0;
          const etaText =
            estimatedSecondsRemaining > 0
              ? `ETA: ${this.formatTimeRemaining(estimatedSecondsRemaining)}`
              : '';

          // Update progress
          progress.report({
            message: `Converting ${file.fileName} (${
              i + 1
            }/${total}) - ${filesPerSecond} files/sec ${etaText}`,
            increment: (1 / total) * 100,
          });

          try {
            // Skip files that are already in target format
            if (
              (file.fileType === 'csv' && options.targetFormat === 'csv') ||
              (file.fileType === 'json' && options.targetFormat === 'json') ||
              (file.fileType === 'excel' && options.targetFormat === 'excel')
            ) {
              skipped++;
              continue;
            }

            // Generate output filename
            const fileExt = this.getFileExtension(options.targetFormat);
            const outputPath = file.filePath.replace(
              /\.(csv|json|xlsx|xls)$/i,
              fileExt
            );

            // Check if output file already exists
            if (fs.existsSync(outputPath) && !options.overwriteFiles) {
              skipped++;
              continue;
            }

            // Execute the conversion
            await this.executeConversion(file, outputPath, options);
            completed++;
          } catch (error) {
            failed++;
            const errorMessage = `Error converting ${file.fileName}: ${
              (error as Error).message
            }`;
            errors.push(errorMessage);

            // Optionally log errors to output channel
            this.logError(errorMessage);
          }

          // Check if we've completed a batch and there are more files to process
          if ((i + 1) % batchSize === 0 && i < files.length - 1) {
            // Calculate progress statistics
            const percentComplete = Math.round(((i + 1) / total) * 100);
            const currentSpeed = (i + 1) / (elapsedMs / 1000);

            // Ask user if they want to continue processing
            const continueResponse = await vscode.window.showInformationMessage(
              `Processed ${i + 1} of ${
                files.length
              } files (${completed} converted, ${skipped} skipped, ${failed} failed).\n` +
                `Progress: ${percentComplete}% complete at ${currentSpeed.toFixed(
                  2
                )} files/sec.\n` +
                `Would you like to continue?`,
              { modal: false },
              'Continue',
              'Pause',
              'View Errors',
              'Stop'
            );

            // Handle user response
            switch (continueResponse) {
              case 'Stop':
                // User chose to stop entirely
                const finalStats = `Summary: ${completed} converted, ${skipped} skipped, ${failed} failed.`;
                vscode.window.showInformationMessage(
                  `Conversion stopped. ${finalStats}`
                );
                return;

              case 'Pause':
                // User chose to pause - we'll handle this at the start of next iteration
                isPaused = true;
                break;

              case 'View Errors':
                // Show error details in a new document if there are any
                if (errors.length > 0) {
                  const errorDoc = await vscode.workspace.openTextDocument({
                    content: errors.join('\n\n'),
                    language: 'plaintext',
                  });
                  await vscode.window.showTextDocument(errorDoc);

                  // Ask if user wants to continue after viewing errors
                  const continueAfterErrors =
                    await vscode.window.showInformationMessage(
                      'Would you like to continue processing files?',
                      'Continue',
                      'Stop'
                    );

                  if (continueAfterErrors !== 'Continue') {
                    return;
                  }
                } else {
                  vscode.window.showInformationMessage(
                    'No errors encountered so far.'
                  );
                }
                break;

              // Default is to continue processing
              default:
                // Just continue to the next batch
                break;
            }
          }
        }

        // Calculate final statistics
        const totalTime = (Date.now() - startTime) / 1000;
        const averageSpeed =
          total > 0 ? (completed / totalTime).toFixed(2) : '0.00';

        // Show summary
        if (errors.length > 0) {
          vscode.window
            .showErrorMessage(
              `Conversion completed in ${this.formatTime(totalTime)}.\n` +
                `Completed: ${completed}, Skipped: ${skipped}, Errors: ${errors.length}\n` +
                `Average speed: ${averageSpeed} files/sec`,
              'Show Details'
            )
            .then(selection => {
              if (selection === 'Show Details') {
                // Show error details in a new document
                const errorDoc = vscode.workspace.openTextDocument({
                  content: errors.join('\n\n'),
                  language: 'plaintext',
                });
                errorDoc.then(doc => vscode.window.showTextDocument(doc));
              }
            });
        } else {
          vscode.window.showInformationMessage(
            `Conversion completed in ${this.formatTime(totalTime)}.\n` +
              `Successfully converted ${completed} files. Skipped: ${skipped}.\n` +
              `Average speed: ${averageSpeed} files/sec`
          );
        }
      }
    );
  }

  private formatTime(seconds: number): string {
    if (seconds < 60) {
      return `${seconds.toFixed(1)}s`;
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    return `${minutes}m ${Math.round(remainingSeconds)}s`;
  }

  private formatTimeRemaining(seconds: number): string {
    if (seconds < 60) {
      return `${seconds}s`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      return `${minutes}m`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return `${hours}h ${minutes}m`;
    }
  }

  private logError(errorMessage: string): void {
    // Get or create output channel (this would be initialized elsewhere)
    const outputChannel = vscode.window.createOutputChannel('DataMorph');
    outputChannel.appendLine(
      `[${new Date().toLocaleTimeString()}] ${errorMessage}`
    );
  }

  private async executeConversion(
    file: FileConversionInfo,
    outputPath: string,
    options: ConversionOptions
  ): Promise<void> {
    // This is where we'll execute the actual conversion
    // We'll use the existing command implementations for simplicity

    // Get command ID based on source and target formats
    const commandId = this.getConversionCommandId(
      file.fileType,
      options.targetFormat
    );

    if (!commandId) {
      throw new Error(
        `Unsupported conversion: ${file.fileType} to ${options.targetFormat}`
      );
    }

    // Execute the command using the command API
    await vscode.commands.executeCommand(
      commandId,
      vscode.Uri.file(file.filePath)
    );

    // Apply YAML transformations if specified
    if (options.yamlTransformationPath && options.targetFormat === 'json') {
      // Read the JSON file
      const jsonContent = fs.readFileSync(outputPath, 'utf8');
      let jsonData = JSON.parse(jsonContent);

      // Apply the transformations
      jsonData = await applyYamlTransformations(
        jsonData,
        options.yamlTransformationPath
      );

      // Write back to file
      const indentation = vscode.workspace
        .getConfiguration('dataconverter')
        .get('jsonIndentation', 2);
      fs.writeFileSync(
        outputPath,
        JSON.stringify(jsonData, null, indentation),
        'utf8'
      );
    }
    // Apply custom transformation if provided
    else if (
      options.customTransformation &&
      options.customTransformation.trim() !== ''
    ) {
      await this.applyCustomTransformation(
        outputPath,
        options.customTransformation
      );
    }
  }

  private async applyCustomTransformation(
    filePath: string,
    transformationScript: string
  ): Promise<void> {
    try {
      // Read the file
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const fileExt = path.extname(filePath).toLowerCase();

      // Parse the data
      let data: any;
      if (fileExt === '.json') {
        data = JSON.parse(fileContent);
      } else if (fileExt === '.csv') {
        // For CSV, we'd need to parse it first, but for now let's just operate on the raw text
        data = fileContent;
      } else {
        // For Excel, we can't easily transform it directly
        throw new Error(
          'Custom transformations for Excel files are not supported'
        );
      }

      // Execute the transformation
      const transformFn = new Function('data', transformationScript);
      const transformedData = transformFn(data);

      // Save the transformed data back to the file
      if (fileExt === '.json') {
        fs.writeFileSync(filePath, JSON.stringify(transformedData, null, 2));
      } else {
        fs.writeFileSync(filePath, transformedData);
      }
    } catch (error) {
      throw new Error(
        `Custom transformation failed: ${(error as Error).message}`
      );
    }
  }

  private getConversionCommandId(
    sourceFormat: 'csv' | 'json' | 'excel' | 'unknown',
    targetFormat: 'csv' | 'json' | 'excel'
  ): string | undefined {
    if (sourceFormat === 'unknown') {
      return undefined;
    }

    const commandMap: Record<string, Record<string, string>> = {
      csv: {
        json: 'dataconverter.convertToJSON',
        excel: 'dataconverter.convertToExcel',
      },
      json: {
        csv: 'dataconverter.convertToCSV',
        excel: 'dataconverter.convertToExcel',
      },
      excel: {
        csv: 'dataconverter.convertToCSV',
        json: 'dataconverter.convertToJSON',
      },
    };

    return commandMap[sourceFormat]?.[targetFormat];
  }

  private getFileExtension(format: 'csv' | 'json' | 'excel'): string {
    switch (format) {
      case 'csv':
        return '.csv';
      case 'json':
        return '.json';
      case 'excel':
        return '.xlsx';
      default:
        return '.txt';
    }
  }

  private async getConvertibleFiles(
    folderUri: vscode.Uri
  ): Promise<FileConversionInfo[]> {
    const result: FileConversionInfo[] = [];

    try {
      // Read directory
      const files = await vscode.workspace.fs.readDirectory(folderUri);

      // Filter and map files
      for (const [name, type] of files) {
        // Skip directories and non-convertible files
        if (type === vscode.FileType.Directory) {
          continue;
        }

        const filePath = path.join(folderUri.fsPath, name);
        const fileType = detectFileType(filePath);

        // Only include convertible files
        if (fileType !== 'unknown') {
          result.push({
            filePath,
            fileName: name,
            fileType,
            selected: true, // Selected by default
          });
        }
      }
    } catch (error) {
      vscode.window.showErrorMessage(
        `Error reading folder: ${(error as Error).message}`
      );
    }

    return result;
  }

  private getBatchConversionHtml(
    files: FileConversionInfo[],
    options: ConversionOptions
  ): string {
    const fileRows = files
      .map(
        file => `
      <tr>
        <td>
          <input type="checkbox" class="file-checkbox" data-path="${this.escapeHtml(
            file.filePath
          )}"
                 data-type="${file.fileType}" ${file.selected ? 'checked' : ''}>
        </td>
        <td>${this.escapeHtml(file.fileName)}</td>
        <td>${this.getFileTypeDisplay(file.fileType)}</td>
      </tr>
    `
      )
      .join('');

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Batch Convert</title>
        <style>
          body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-editor-foreground);
            background-color: var(--vscode-editor-background);
          }

          h2 {
            margin-bottom: 16px;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            margin: 16px 0;
          }

          th, td {
            padding: 8px;
            text-align: left;
            border-bottom: 1px solid var(--vscode-panel-border);
          }

          th {
            background-color: var(--vscode-editor-selectionBackground);
          }

          .options-container {
            margin: 20px 0;
          }

          .option-row {
            margin-bottom: 10px;
          }

          .buttons {
            display: flex;
            justify-content: flex-end;
            margin-top: 20px;
          }

          button {
            padding: 6px 12px;
            margin-left: 8px;
            cursor: pointer;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 2px;
          }

          button:hover {
            background-color: var(--vscode-button-hoverBackground);
          }

          .cancel-button {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
          }

          .custom-transform {
            width: 100%;
            height: 100px;
            font-family: monospace;
            margin-top: 6px;
          }

          .header-actions {
            display: flex;
            gap: 10px;
          }

          .tab-container {
            margin: 20px 0;
          }

          .tab-buttons {
            display: flex;
            border-bottom: 1px solid var(--vscode-panel-border);
          }

          .tab-button {
            padding: 8px 16px;
            cursor: pointer;
            background: none;
            border: none;
            color: var(--vscode-foreground);
          }

          .tab-button.active {
            border-bottom: 2px solid var(--vscode-button-background);
            color: var(--vscode-button-background);
          }

          .tab-content {
            padding: 16px 0;
            display: none;
          }

          .tab-content.active {
            display: block;
          }

          .yaml-file-row {
            display: flex;
            align-items: center;
            margin: 10px 0;
          }

          .yaml-file-path {
            flex: 1;
            padding: 5px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 2px;
            margin-right: 10px;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }

          .yaml-buttons {
            display: flex;
            gap: 6px;
          }
        </style>
      </head>
      <body>
        <h2>Batch Convert Files to ${this.getFileTypeDisplay(
          options.targetFormat
        )}</h2>

        <div class="header-actions">
          <button id="selectAll">Select All</button>
          <button id="deselectAll">Deselect All</button>
        </div>

        <table>
          <thead>
            <tr>
              <th>Convert</th>
              <th>File Name</th>
              <th>Type</th>
            </tr>
          </thead>
          <tbody>
            ${fileRows}
          </tbody>
        </table>

        <div class="options-container">
          <h3>Conversion Options</h3>

          <div class="option-row">
            <label>
              <input type="checkbox" id="preserve-types" ${
                options.preserveTypes ? 'checked' : ''
              }>
              Preserve data types
            </label>
          </div>

          <div class="option-row">
            <label>
              <input type="checkbox" id="overwrite-files" ${
                options.overwriteFiles ? 'checked' : ''
              }>
              Overwrite existing files
            </label>
          </div>

          <div class="tab-container">
            <div class="tab-buttons">
              <button class="tab-button active" data-tab="js-transform">JavaScript Transform</button>
              <button class="tab-button" data-tab="yaml-transform">YAML Transform</button>
            </div>

            <div class="tab-content active" id="js-transform">
              <div class="option-row">
                <label for="custom-transform">Custom Transformation (JavaScript):</label>
                <textarea id="custom-transform" class="custom-transform" placeholder="// Optional: Add custom JS transformation code here.
// Example:
// if (Array.isArray(data)) {
//   return data.filter(item => item.active === true);
// }
// return data;"></textarea>
                <div class="hint">This code will be executed after conversion. The 'data' variable contains the converted data.</div>
              </div>
            </div>

            <div class="tab-content" id="yaml-transform">
              <div class="option-row">
                <label>YAML Transformation File:</label>
                <div class="yaml-file-row">
                  <div class="yaml-file-path" id="yaml-file-path">No file selected</div>
                  <div class="yaml-buttons">
                    <button id="select-yaml-btn">Select File</button>
                    <button id="create-yaml-btn">Create New</button>
                  </div>
                </div>
                <div class="hint">YAML files provide a declarative way to define transformations.</div>
              </div>
            </div>
          </div>
        </div>

        <div class="buttons">
          <button class="cancel-button" id="cancel-btn">Cancel</button>
          <button id="convert-btn">Start Conversion</button>
        </div>

        <script>
          (function() {
            // Select UI elements
            const selectAllBtn = document.getElementById('selectAll');
            const deselectAllBtn = document.getElementById('deselectAll');
            const fileCheckboxes = document.querySelectorAll('.file-checkbox');
            const preserveTypesCheckbox = document.getElementById('preserve-types');
            const overwriteFilesCheckbox = document.getElementById('overwrite-files');
            const customTransformTextarea = document.getElementById('custom-transform');
            const yamlFilePath = document.getElementById('yaml-file-path');
            const selectYamlBtn = document.getElementById('select-yaml-btn');
            const createYamlBtn = document.getElementById('create-yaml-btn');
            const tabButtons = document.querySelectorAll('.tab-button');
            const tabContents = document.querySelectorAll('.tab-content');
            const convertBtn = document.getElementById('convert-btn');
            const cancelBtn = document.getElementById('cancel-btn');

            let selectedYamlPath = '';
            let activeTransformTab = 'js-transform';

            // Set up tab switching
            tabButtons.forEach(button => {
              button.addEventListener('click', () => {
                const tabName = button.dataset.tab;

                // Update active tab button
                tabButtons.forEach(btn => btn.classList.remove('active'));
                button.classList.add('active');

                // Show selected tab content
                tabContents.forEach(content => content.classList.remove('active'));
                document.getElementById(tabName).classList.add('active');

                // Track active tab
                activeTransformTab = tabName;
              });
            });

            // Event listeners
            selectAllBtn.addEventListener('click', () => {
              fileCheckboxes.forEach(checkbox => checkbox.checked = true);
            });

            deselectAllBtn.addEventListener('click', () => {
              fileCheckboxes.forEach(checkbox => checkbox.checked = false);
            });

            selectYamlBtn.addEventListener('click', () => {
              vscode.postMessage({ command: 'selectYamlFile' });
            });

            createYamlBtn.addEventListener('click', () => {
              vscode.postMessage({ command: 'createYamlTemplate' });
            });

            convertBtn.addEventListener('click', () => {
              // Collect selected files
              const selectedFiles = Array.from(fileCheckboxes)
                .filter(checkbox => checkbox.checked)
                .map(checkbox => {
                  const { path, type } = (checkbox as HTMLElement).dataset;
                  return {
                    filePath: path,
                    fileName: path.split('/').pop() || path.split('\\\\').pop(),
                    fileType: type,
                    selected: true
                  };
                });

              if (selectedFiles.length === 0) {
                alert('Please select at least one file to convert.');
                return;
              }

              // Collect options
              const options = {
                targetFormat: '${options.targetFormat}',
                preserveTypes: preserveTypesCheckbox.checked,
                overwriteFiles: overwriteFilesCheckbox.checked
              };

              // Add transformation based on active tab
              if (activeTransformTab === 'js-transform' && customTransformTextarea.value.trim()) {
                options.customTransformation = customTransformTextarea.value;
              } else if (activeTransformTab === 'yaml-transform' && selectedYamlPath) {
                options.yamlTransformationPath = selectedYamlPath;
              }

              // Send message to extension
              vscode.postMessage({
                command: 'startConversion',
                files: selectedFiles,
                options: options
              });
            });

            cancelBtn.addEventListener('click', () => {
              vscode.postMessage({ command: 'cancel' });
            });

            // Handle messages from extension
            window.addEventListener('message', event => {
              const message = event.data;

              switch (message.command) {
                case 'yamlFileSelected':
                  yamlFilePath.textContent = message.path;
                  yamlFilePath.title = message.path;
                  selectedYamlPath = message.path;
                  break;
              }
            });

            // Initialize VSCode API
            const vscode = acquireVsCodeApi();
          })();
        </script>
      </body>
      </html>
    `;
  }

  private getFileTypeDisplay(fileType: string): string {
    switch (fileType) {
      case 'csv':
        return 'CSV';
      case 'json':
        return 'JSON';
      case 'excel':
        return 'Excel';
      default:
        return 'Unknown';
    }
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
