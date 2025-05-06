# DataMorph - VS Code Data Format Converter

DataMorph is a powerful VS Code extension that lets you seamlessly convert between CSV, Excel (.xlsx), and JSON formats directly within your editor. Think of it as a shape-shifter for your data files, enabling quick transformations and visualization.

## Features

### 🔄 Format Conversion

- Convert between CSV, JSON, and Excel (.xlsx) formats with a single click
- Available through right-click context menu or command palette
- Preserves data types during conversion
- Smart flattening of nested JSON for CSV conversions

### 👁️ Data Preview

- Inline preview of tabular data for CSV and Excel files
- Structured tree view for JSON files
- Multi-sheet support for Excel files

### 🔢 Batch Processing

- Convert multiple files in one operation
- Select which files to include in batch conversion
- Apply custom transformations to converted files

### 🧩 Custom Transformations

- Define custom JavaScript transformations for your data
- Apply data filtering, mapping, or enrichment during conversion
- Save and reuse transformation snippets using JavaScript or YAML config

## Installation

You can install this extension from the [Visual Studio Code Marketplace](https://marketplace.visualstudio.com/).

## How to Use

### Single File Conversion

1. Right-click on a CSV, JSON, or Excel file in the Explorer or Editor
2. Select one of the following options:
   - `DataMorph: Convert to JSON`
   - `DataMorph: Convert to CSV`
   - `DataMorph: Convert to Excel (.xlsx)`
3. The converted file will be created in the same directory

### Data Preview

1. Open a CSV, JSON, or Excel file
2. Right-click and select `DataMorph: Preview Data`
3. A preview panel will open showing your data in a structured format

### Batch Conversion

1. Right-click on a folder in the Explorer
2. Select `DataMorph: Batch Convert Files`
3. Choose the target format (CSV, JSON, or Excel)
4. Select which files to include and configure conversion options
5. Click "Start Conversion" to process all selected files

### Custom JavaScript Transformations

When using batch conversion, you can add custom JavaScript code to transform your data:

```javascript
// Example: Filter records where the status is "active"
if (Array.isArray(data)) {
  return data.filter(item => item.status === 'active');
}
return data;
```

### Custom YAML Transformation Rules

You can also define transformation rules using YAML config files:

```yaml
# example-transform.yaml
transformations:
  - name: 'Filter Active Users'
    condition: 'data.isActive === true'

  - name: 'Rename Fields'
    mapping:
      userName: 'name'
      userEmail: 'email'

  - name: 'Add Calculated Field'
    calculate:
      field: 'fullName'
      expression: "data.firstName + ' ' + data.lastName"
```

## Extension Settings

This extension contributes the following settings:

- `datamorph.preserveDataTypes`: Enable/disable preservation of data types during conversion
- `datamorph.csvDelimiter`: Specify the delimiter to use for CSV files
- `datamorph.jsonIndentation`: Number of spaces for JSON indentation
- `datamorph.useWebWorkers`: Enable/disable web workers for processing large files

## Performance Optimization

DataMorph uses web workers or WASM (when available) to handle heavy processing efficiently without blocking the editor. This makes it suitable for working with larger data files.

## Requirements

- Visual Studio Code 1.99.0 or newer

## Known Issues

- Excel files with complex formatting or formulas may lose some formatting during conversion
- Very large files (>100MB) may cause performance issues

## Release Notes

### 1.0.0

- Initial release of DataMorph
- Support for CSV, JSON, and Excel conversions
- Data preview functionality
- Batch conversion support
- Custom transformation capabilities

---

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This extension is licensed under the [MIT License](LICENSE).
