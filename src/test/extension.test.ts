import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import * as temp from 'os';
import { tmpdir } from 'os';
import * as XLSX from 'xlsx';
import * as Papa from 'papaparse';

// Import utilities to test
import {
  csvToJson,
  jsonToCsv,
  excelToJson,
  excelToCsv,
  detectFileType,
} from '../utils';

suite('DataMorph Extension Tests', () => {
  // Test data paths
  const sampleDataDir = path.join(__dirname, '../../../sample-data');
  const jsonFilePath = path.join(sampleDataDir, 'sample-users.json');
  const csvFilePath = path.join(sampleDataDir, 'sample-products.csv');
  let tempDir: string;

  // Set up temporary directory for test outputs
  suiteSetup(() => {
    tempDir = path.join(tmpdir(), 'datamorph-tests-' + Date.now());
    fs.mkdirSync(tempDir, { recursive: true });
    vscode.window.showInformationMessage('Starting DataMorph tests...');
  });

  suiteTeardown(() => {
    // Clean up temporary files after tests
    try {
      if (tempDir && fs.existsSync(tempDir)) {
        const files = fs.readdirSync(tempDir);
        files.forEach(file => {
          fs.unlinkSync(path.join(tempDir, file));
        });
        fs.rmdirSync(tempDir);
      }
    } catch (err) {
      console.error('Error during test cleanup:', err);
    }
  });

  test('Extension should be activated', async () => {
    const extension = vscode.extensions.getExtension('datamorph.datamorph');
    assert.notStrictEqual(
      extension,
      undefined,
      'Extension should be available'
    );

    if (extension) {
      await extension.activate();
      assert.strictEqual(
        extension.isActive,
        true,
        'Extension should be activated'
      );
    }
  });

  test('Commands should be registered', () => {
    return vscode.commands.getCommands(true).then(commands => {
      const datamorphCommands = [
        'datamorph.convertToJSON',
        'datamorph.convertToCSV',
        'datamorph.convertToExcel',
        'datamorph.previewData',
        'datamorph.batchConvert',
        'datamorph.createSampleExcel',
      ];

      const registeredCommands = commands.filter(cmd =>
        datamorphCommands.includes(cmd)
      );

      assert.strictEqual(
        registeredCommands.length,
        datamorphCommands.length,
        'All DataMorph commands should be registered'
      );
    });
  });

  test('File type detection', () => {
    assert.strictEqual(detectFileType('file.csv'), 'csv');
    assert.strictEqual(detectFileType('file.CSV'), 'csv');
    assert.strictEqual(detectFileType('file.json'), 'json');
    assert.strictEqual(detectFileType('file.JSON'), 'json');
    assert.strictEqual(detectFileType('file.xlsx'), 'excel');
    assert.strictEqual(detectFileType('file.XLSX'), 'excel');
    assert.strictEqual(detectFileType('file.xls'), 'excel');
    assert.strictEqual(detectFileType('file.txt'), 'unknown');
  });

  test('CSV to JSON conversion', async function () {
    this.timeout(10000); // Allow extra time for file operations

    // Check if sample data exists
    if (!fs.existsSync(csvFilePath)) {
      this.skip();
    }

    // Read test data
    const csvData = fs.readFileSync(csvFilePath, 'utf8');

    // Convert CSV to JSON
    const jsonResult = await csvToJson(csvData);

    // Validate conversion
    assert.strictEqual(
      Array.isArray(jsonResult),
      true,
      'Result should be an array'
    );
    assert.strictEqual(jsonResult.length > 0, true, 'Result should have items');

    // Check data types are preserved
    const firstItem = jsonResult[0];
    assert.strictEqual(
      typeof firstItem.product_id,
      'number',
      'Numeric fields should be preserved'
    );
    assert.strictEqual(
      typeof firstItem.price,
      'number',
      'Price should be a number'
    );
    assert.strictEqual(
      typeof firstItem.in_stock,
      'boolean',
      'Boolean fields should be preserved'
    );
  });

  test('JSON to CSV conversion', async function () {
    this.timeout(10000);

    // Check if sample data exists
    if (!fs.existsSync(jsonFilePath)) {
      this.skip();
    }

    // Read test data
    const jsonData = fs.readFileSync(jsonFilePath, 'utf8');

    // Convert JSON to CSV
    const csvResult = await jsonToCsv(jsonData);

    // Validate conversion
    assert.strictEqual(typeof csvResult, 'string', 'Result should be a string');
    assert.strictEqual(
      csvResult.length > 0,
      true,
      'Result should not be empty'
    );

    // Check CSV structure
    const lines = csvResult.trim().split('\n');
    assert.strictEqual(
      lines.length > 1,
      true,
      'CSV should have header and data rows'
    );

    // Check for flattening of nested objects
    const header = lines[0];
    assert.strictEqual(
      header.includes('address.city') || header.includes('"address.city"'),
      true,
      'Nested objects should be flattened in CSV headers'
    );
  });

  // Test Excel-related functionality if sample Excel file exists
  test('Create Sample Excel file', async function () {
    this.timeout(10000);

    const tempExcelPath = path.join(tempDir, 'test-excel-output.xlsx');

    // Create a new Excel file for testing
    const workbook = XLSX.utils.book_new();
    const testData = [
      { id: 1, name: 'Test 1', value: 100 },
      { id: 2, name: 'Test 2', value: 200 },
    ];

    const worksheet = XLSX.utils.json_to_sheet(testData);
    XLSX.utils.book_append_sheet(workbook, worksheet, 'TestSheet');
    XLSX.writeFile(workbook, tempExcelPath);

    // Verify the file was created
    assert.strictEqual(
      fs.existsSync(tempExcelPath),
      true,
      'Excel file should be created'
    );

    // Test Excel to JSON conversion
    const jsonResult = await excelToJson(tempExcelPath);
    assert.strictEqual(
      Array.isArray(jsonResult),
      true,
      'Result should be an array'
    );
    assert.strictEqual(jsonResult.length, 2, 'Result should have 2 items');
    assert.strictEqual(
      jsonResult[0].name,
      'Test 1',
      'Data should be correctly preserved'
    );

    // Test Excel to CSV conversion
    const csvResult = await excelToCsv(tempExcelPath);
    assert.strictEqual(typeof csvResult, 'string', 'Result should be a string');
    assert.strictEqual(
      csvResult.includes('Test 1'),
      true,
      'CSV should contain the data'
    );
  });

  // Test command execution
  test('Execute commands', async function () {
    this.timeout(15000);

    // Skip if sample data doesn't exist
    if (!fs.existsSync(jsonFilePath)) {
      this.skip();
    }

    // Create temporary output files
    const tempJsonPath = path.join(tempDir, 'test-output.json');
    fs.copyFileSync(jsonFilePath, tempJsonPath);

    // Open file in editor
    const doc = await vscode.workspace.openTextDocument(tempJsonPath);
    await vscode.window.showTextDocument(doc);

    // Make sure we have an active editor
    assert.notStrictEqual(
      vscode.window.activeTextEditor,
      undefined,
      'There should be an active editor'
    );

    // Execute command
    await vscode.commands.executeCommand('datamorph.convertToCSV');

    // Check if CSV file was created (async operation, might need some delay)
    await new Promise(resolve => setTimeout(resolve, 1000));

    const expectedCsvPath = tempJsonPath.replace('.json', '.csv');
    assert.strictEqual(
      fs.existsSync(expectedCsvPath),
      true,
      'CSV file should be created by the command'
    );
  });
});
