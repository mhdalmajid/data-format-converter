<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

## DataMorph Extension Context

This is a VS Code extension project that enables seamless conversion between CSV, Excel, and JSON formats.

### Key Components

- `extension.ts`: Main entry point that registers the commands and handles file operations
- `utils.ts`: Contains utility functions for file conversions
- `dataPreview.ts`: Handles the preview webview panel for visualizing data
- `batchConversion.ts`: Implements batch conversion functionality for multiple files
- `transformations.ts`: Implements YAML-based data transformation rules

### Code Patterns

- Use async/await for asynchronous operations
- Handle errors with try/catch blocks and show appropriate error messages
- Use TypeScript interfaces for type checking
- Follow VS Code webview best practices for UI components
- Use web workers for heavy processing when possible

### VS Code APIs

The extension uses the following VS Code APIs:

- `vscode.commands` for registering commands
- `vscode.window` for UI interactions
- `vscode.workspace` for file operations
- `vscode.WebviewPanel` for data visualization

### External Libraries

- `xlsx` for Excel file handling
- `papaparse` for CSV parsing
- `csv-parse` and `csv-stringify` for additional CSV operations
- `js-yaml` for YAML transformation file parsing

### Functionality Notes

1. File conversions use smart type inference to preserve data types when possible
2. Nested JSON objects are flattened for CSV conversion
3. Excel conversions handle multiple sheets
4. The extension offers both GUI and command palette interfaces
5. Custom transformations use JavaScript functions or YAML config files to modify data during conversion

### Implementation Tips

1. When adding new file formats, update the `detectFileType` function in `utils.ts`
2. For new transformation types, extend the transformation interfaces in `transformations.ts`
3. To add new preview types, extend the DataPreviewPanel class in `dataPreview.ts`
4. Web workers should be used for CPU-intensive operations to keep the UI responsive
5. Use VS Code's built-in progress API for long-running operations
