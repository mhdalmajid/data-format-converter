// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import * as Papa from 'papaparse';
import { parse as csvParse } from 'csv-parse/sync';
import { stringify as csvStringify } from 'csv-stringify/sync';

// Data converter utility functions
import {
  csvToJson,
  jsonToCsv,
  excelToJson,
  excelToCsv,
  jsonToExcel,
  csvToExcel,
  detectFileType,
  createWebWorker,
} from './utils';

// Web panels and views
import { DataPreviewPanel } from './dataPreview';
import { BatchConversionProvider } from './batchConversion';

export function activate(context: vscode.ExtensionContext) {
  console.log('Data Format Converter extension is now active!');

  // Register data preview provider
  const dataPreviewProvider = new DataPreviewPanel(context.extensionUri);

  // Register batch conversion provider
  const batchConversionProvider = new BatchConversionProvider();

  // Register convert to JSON command
  const convertToJsonCommand = vscode.commands.registerCommand(
    'dataconverter.convertToJSON',
    async (fileUri?: vscode.Uri) => {
      try {
        // Get the file URI if not provided via right-click
        const uri = fileUri || vscode.window.activeTextEditor?.document.uri;
        if (!uri) {
          vscode.window.showErrorMessage(
            'No file selected. Please open a file first.'
          );
          return;
        }

        const fileExtension = path.extname(uri.fsPath).toLowerCase();
        const outputPath = uri.fsPath.replace(/\.(csv|xlsx)$/i, '.json');

        // Check if output file already exists
        if (fs.existsSync(outputPath)) {
          const overwrite = await vscode.window.showWarningMessage(
            `File ${path.basename(outputPath)} already exists. Overwrite?`,
            'Yes',
            'No'
          );
          if (overwrite !== 'Yes') {
            return;
          }
        }

        let result;
        const useWebWorkers = vscode.workspace
          .getConfiguration('dataconverter')
          .get('useWebWorkers', true);

        if (fileExtension === '.csv') {
          if (useWebWorkers) {
            result = await createWebWorker(
              'csvToJson',
              fs.readFileSync(uri.fsPath, 'utf8')
            );
          } else {
            result = await csvToJson(uri.fsPath);
          }
        } else if (fileExtension === '.xlsx') {
          result = await excelToJson(uri.fsPath);
        } else {
          vscode.window.showErrorMessage(
            'Unsupported file format. Please select a CSV or Excel file.'
          );
          return;
        }

        // Write the result to file
        fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));

        vscode.window.showInformationMessage(
          `Successfully converted to JSON: ${path.basename(outputPath)}`
        );

        // Open the new file in the editor
        const document = await vscode.workspace.openTextDocument(outputPath);
        await vscode.window.showTextDocument(document);
      } catch (error: any) {
        vscode.window.showErrorMessage(
          `Error converting file: ${error.message}`
        );
      }
    }
  );

  // Register convert to CSV command
  const convertToCsvCommand = vscode.commands.registerCommand(
    'dataconverter.convertToCSV',
    async (fileUri?: vscode.Uri) => {
      try {
        // Get the file URI if not provided
        const uri = fileUri || vscode.window.activeTextEditor?.document.uri;
        if (!uri) {
          vscode.window.showErrorMessage(
            'No file selected. Please open a file first.'
          );
          return;
        }

        const fileExtension = path.extname(uri.fsPath).toLowerCase();
        const outputPath = uri.fsPath.replace(/\.(json|xlsx)$/i, '.csv');

        // Check if output file already exists
        if (fs.existsSync(outputPath)) {
          const overwrite = await vscode.window.showWarningMessage(
            `File ${path.basename(outputPath)} already exists. Overwrite?`,
            'Yes',
            'No'
          );
          if (overwrite !== 'Yes') {
            return;
          }
        }

        let result;
        const useWebWorkers = vscode.workspace
          .getConfiguration('dataconverter')
          .get('useWebWorkers', true);

        if (fileExtension === '.json') {
          if (useWebWorkers) {
            const jsonContent = fs.readFileSync(uri.fsPath, 'utf8');
            result = await createWebWorker('jsonToCsv', jsonContent);
          } else {
            result = await jsonToCsv(uri.fsPath);
          }
        } else if (fileExtension === '.xlsx') {
          result = await excelToCsv(uri.fsPath);
        } else {
          vscode.window.showErrorMessage(
            'Unsupported file format. Please select a JSON or Excel file.'
          );
          return;
        }

        // Write the result to file
        fs.writeFileSync(outputPath, result);

        vscode.window.showInformationMessage(
          `Successfully converted to CSV: ${path.basename(outputPath)}`
        );

        // Open the new file in the editor
        const document = await vscode.workspace.openTextDocument(outputPath);
        await vscode.window.showTextDocument(document);
      } catch (error: any) {
        vscode.window.showErrorMessage(
          `Error converting file: ${error.message}`
        );
      }
    }
  );

  // Register convert to Excel command
  const convertToExcelCommand = vscode.commands.registerCommand(
    'dataconverter.convertToExcel',
    async (fileUri?: vscode.Uri) => {
      try {
        // Get the file URI if not provided
        const uri = fileUri || vscode.window.activeTextEditor?.document.uri;
        if (!uri) {
          vscode.window.showErrorMessage(
            'No file selected. Please open a file first.'
          );
          return;
        }

        const fileExtension = path.extname(uri.fsPath).toLowerCase();
        const outputPath = uri.fsPath.replace(/\.(json|csv)$/i, '.xlsx');

        // Check if output file already exists
        if (fs.existsSync(outputPath)) {
          const overwrite = await vscode.window.showWarningMessage(
            `File ${path.basename(outputPath)} already exists. Overwrite?`,
            'Yes',
            'No'
          );
          if (overwrite !== 'Yes') {
            return;
          }
        }

        if (fileExtension === '.json') {
          await jsonToExcel(uri.fsPath, outputPath);
        } else if (fileExtension === '.csv') {
          await csvToExcel(uri.fsPath, outputPath);
        } else {
          vscode.window.showErrorMessage(
            'Selected file must be a JSON or CSV file.'
          );
          return;
        }

        vscode.window.showInformationMessage(
          `Successfully converted ${path.basename(uri.fsPath)} to Excel.`
        );
      } catch (error) {
        vscode.window.showErrorMessage(
          `Error converting file: ${(error as Error).message}`
        );
      }
    }
  );

  // Register preview data command
  const previewDataCommand = vscode.commands.registerCommand(
    'dataconverter.previewData', // Changed from 'datamorph.previewData' to match package.json
    async (fileUri?: vscode.Uri) => {
      try {
        // Get the file URI if not provided via right-click
        const uri = fileUri || vscode.window.activeTextEditor?.document.uri;
        if (!uri) {
          vscode.window.showErrorMessage(
            'No file selected. Please open a file first.'
          );
          return;
        }

        const fileExtension = path.extname(uri.fsPath).toLowerCase();
        await dataPreviewProvider.show(uri);
      } catch (error) {
        vscode.window.showErrorMessage(
          `Error previewing file: ${(error as Error).message}`
        );
      }
    }
  );

  // Register batch convert command
  const batchConvertCommand = vscode.commands.registerCommand(
    'dataconverter.batchConvert', // Changed from 'datamorph.batchConvert' to match package.json
    async (folderUri?: vscode.Uri) => {
      try {
        // Get the folder URI if not provided via right-click
        const uri =
          folderUri ||
          (
            await vscode.window.showOpenDialog({
              canSelectFiles: false,
              canSelectFolders: true,
              canSelectMany: false,
              openLabel: 'Select Folder',
            })
          )?.[0];

        if (!uri) {
          return; // User cancelled the folder selection
        }

        await batchConversionProvider.showBatchConversion(uri);
      } catch (error) {
        vscode.window.showErrorMessage(
          `Error during batch conversion: ${(error as Error).message}`
        );
      }
    }
  );

  // Register create sample Excel file command
  const createSampleExcelCommand = vscode.commands.registerCommand(
    'dataconverter.createSampleExcel', // Changed from 'datamorph.createSampleExcel' to match package.json
    async () => {
      try {
        // Get workspace folders
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
          vscode.window.showErrorMessage('No workspace folder is open.');
          return;
        }

        // Create sample-data directory if it doesn't exist
        const sampleDataPath = path.join(
          workspaceFolders[0].uri.fsPath,
          'sample-data'
        );
        if (!fs.existsSync(sampleDataPath)) {
          fs.mkdirSync(sampleDataPath, { recursive: true });
        }

        const excelFilePath = path.join(sampleDataPath, 'sample-sales.xlsx');

        // Create sample data
        const salesData = [
          {
            order_id: 'ORD-001',
            date: '2024-01-15',
            customer_name: 'John Smith',
            product: 'Laptop Pro',
            quantity: 1,
            unit_price: 1299.99,
            total: 1299.99,
            payment_method: 'Credit Card',
            status: 'Delivered',
          },
          {
            order_id: 'ORD-002',
            date: '2024-01-17',
            customer_name: 'Emily Johnson',
            product: 'Wireless Mouse',
            quantity: 2,
            unit_price: 24.95,
            total: 49.9,
            payment_method: 'PayPal',
            status: 'Delivered',
          },
          {
            order_id: 'ORD-003',
            date: '2024-01-20',
            customer_name: 'Michael Brown',
            product: '27" Monitor',
            quantity: 1,
            unit_price: 349.5,
            total: 349.5,
            payment_method: 'Credit Card',
            status: 'Shipped',
          },
          {
            order_id: 'ORD-004',
            date: '2024-01-25',
            customer_name: 'Sarah Wilson',
            product: 'Ergonomic Keyboard',
            quantity: 1,
            unit_price: 89.99,
            total: 89.99,
            payment_method: 'Credit Card',
            status: 'Processing',
          },
          {
            order_id: 'ORD-005',
            date: '2024-01-30',
            customer_name: 'David Lee',
            product: 'Laptop Pro',
            quantity: 1,
            unit_price: 1299.99,
            total: 1299.99,
            payment_method: 'Bank Transfer',
            status: 'Delivered',
          },
        ];

        const inventoryData = [
          {
            product_id: 'PROD-001',
            product_name: 'Laptop Pro',
            category: 'Computers',
            in_stock: 15,
            price: 1299.99,
            last_restock: '2024-01-10',
          },
          {
            product_id: 'PROD-002',
            product_name: 'Wireless Mouse',
            category: 'Accessories',
            in_stock: 42,
            price: 24.95,
            last_restock: '2024-01-05',
          },
          {
            product_id: 'PROD-003',
            product_name: '27" Monitor',
            category: 'Displays',
            in_stock: 8,
            price: 349.5,
            last_restock: '2023-12-20',
          },
          {
            product_id: 'PROD-004',
            product_name: 'Ergonomic Keyboard',
            category: 'Accessories',
            in_stock: 22,
            price: 89.99,
            last_restock: '2024-01-15',
          },
          {
            product_id: 'PROD-005',
            product_name: 'External SSD 1TB',
            category: 'Storage',
            in_stock: 30,
            price: 149.99,
            last_restock: '2024-01-12',
          },
        ];

        // Create workbook with multiple sheets
        const workbook = XLSX.utils.book_new();

        // Add sales data sheet
        const salesWorksheet = XLSX.utils.json_to_sheet(salesData);
        XLSX.utils.book_append_sheet(workbook, salesWorksheet, 'Sales');

        // Add inventory data sheet
        const inventoryWorksheet = XLSX.utils.json_to_sheet(inventoryData);
        XLSX.utils.book_append_sheet(workbook, inventoryWorksheet, 'Inventory');

        // Write to file
        XLSX.writeFile(workbook, excelFilePath);

        vscode.window.showInformationMessage(
          `Sample Excel file created at: ${excelFilePath}`
        );

        // Open the file
        const uri = vscode.Uri.file(excelFilePath);
        vscode.commands.executeCommand('vscode.open', uri);
      } catch (error) {
        vscode.window.showErrorMessage(
          `Error creating sample Excel file: ${(error as Error).message}`
        );
      }
    }
  );

  context.subscriptions.push(
    convertToJsonCommand,
    convertToCsvCommand,
    convertToExcelCommand,
    previewDataCommand,
    batchConvertCommand,
    createSampleExcelCommand
  );
}

export function deactivate() {}
