import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { tmpdir } from 'os';
import { BatchConversionProvider } from '../batchConversion';

// Define file info interface for type checking
interface FileInfo {
  filePath: string;
  fileType: string;
}

suite('DataMorph Batch Conversion Tests', () => {
  let tempDir: string;
  const sampleDataDir = path.join(__dirname, '../../../sample-data');
  let provider: BatchConversionProvider;

  // Set up temporary directory for test outputs
  suiteSetup(() => {
    tempDir = path.join(tmpdir(), 'datamorph-batch-tests-' + Date.now());
    fs.mkdirSync(tempDir, { recursive: true });
    provider = new BatchConversionProvider();
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

  test('Detect convertible files', async function () {
    this.timeout(10000);

    // Skip test if sample data doesn't exist
    if (!fs.existsSync(sampleDataDir)) {
      this.skip();
    }

    // Create test files
    const testJsonFile = path.join(tempDir, 'test.json');
    const testCsvFile = path.join(tempDir, 'test.csv');
    const testTxtFile = path.join(tempDir, 'test.txt');

    fs.writeFileSync(testJsonFile, '{"test": "data"}');
    fs.writeFileSync(testCsvFile, 'header\nvalue');
    fs.writeFileSync(testTxtFile, 'This is a text file');

    // Test private method through a wrapper
    // We need to use any type to access private method for testing
    const files = (await (provider as any).getConvertibleFiles(
      vscode.Uri.file(tempDir)
    )) as FileInfo[];

    // Verify results
    assert.strictEqual(Array.isArray(files), true, 'Should return an array');
    assert.strictEqual(files.length, 2, 'Should find 2 convertible files');

    // Find JSON and CSV files in results
    const jsonFile = files.find((f: FileInfo) => f.fileType === 'json');
    const csvFile = files.find((f: FileInfo) => f.fileType === 'csv');

    // Verify file detection
    assert.notStrictEqual(jsonFile, undefined, 'Should detect JSON file');
    assert.notStrictEqual(csvFile, undefined, 'Should detect CSV file');
    assert.strictEqual(
      jsonFile?.filePath.includes('test.json'),
      true,
      'Should have correct path for JSON'
    );
    assert.strictEqual(
      csvFile?.filePath.includes('test.csv'),
      true,
      'Should have correct path for CSV'
    );
  });

  test('Get file extension based on format', () => {
    // Test private method through a wrapper
    // We need to use any type to access private method for testing
    const csvExt = (provider as any).getFileExtension('csv');
    const jsonExt = (provider as any).getFileExtension('json');
    const excelExt = (provider as any).getFileExtension('excel');

    assert.strictEqual(csvExt, '.csv', 'Should return .csv extension');
    assert.strictEqual(jsonExt, '.json', 'Should return .json extension');
    assert.strictEqual(excelExt, '.xlsx', 'Should return .xlsx extension');
  });

  test('Get file type display', () => {
    // Test private method through a wrapper
    // We need to use any type to access private method for testing
    const csvDisplay = (provider as any).getFileTypeDisplay('csv');
    const jsonDisplay = (provider as any).getFileTypeDisplay('json');
    const excelDisplay = (provider as any).getFileTypeDisplay('excel');
    const unknownDisplay = (provider as any).getFileTypeDisplay('unknown');

    assert.strictEqual(csvDisplay, 'CSV', 'Should return CSV display name');
    assert.strictEqual(jsonDisplay, 'JSON', 'Should return JSON display name');
    assert.strictEqual(
      excelDisplay,
      'Excel',
      'Should return Excel display name'
    );
    assert.strictEqual(
      unknownDisplay,
      'Unknown',
      'Should return Unknown for unknown types'
    );
  });

  test('Get conversion command ID', () => {
    // Test private method through a wrapper
    // We need to use any type to access private method for testing
    const csvToJson = (provider as any).getConversionCommandId('csv', 'json');
    const jsonToExcel = (provider as any).getConversionCommandId(
      'json',
      'excel'
    );
    const excelToCsv = (provider as any).getConversionCommandId('excel', 'csv');
    const unknownConversion = (provider as any).getConversionCommandId(
      'unknown',
      'json'
    );

    assert.strictEqual(
      csvToJson,
      'datamorph.convertToJSON',
      'Should return correct command for CSV to JSON'
    );
    assert.strictEqual(
      jsonToExcel,
      'datamorph.convertToExcel',
      'Should return correct command for JSON to Excel'
    );
    assert.strictEqual(
      excelToCsv,
      'datamorph.convertToCSV',
      'Should return correct command for Excel to CSV'
    );
    assert.strictEqual(
      unknownConversion,
      undefined,
      'Should return undefined for unknown source format'
    );
  });

  test('Escape HTML', () => {
    // Test private method through a wrapper
    // We need to use any type to access private method for testing
    const escaped = (provider as any).escapeHtml(
      '<script>"Hello & World"\'test\'</script>'
    );

    assert.strictEqual(
      escaped.includes('<script>'),
      false,
      'Should escape HTML tags'
    );
    assert.strictEqual(
      escaped.includes('&quot;'),
      true,
      'Should escape quotes'
    );
    assert.strictEqual(
      escaped.includes('&amp;'),
      true,
      'Should escape ampersands'
    );
    assert.strictEqual(
      escaped.includes('&#039;'),
      true,
      'Should escape single quotes'
    );
  });

  test('Apply custom transformation', async function () {
    this.timeout(10000);

    // Create test JSON file
    const testJsonPath = path.join(tempDir, 'transform-test.json');
    const testData = JSON.stringify([
      { id: 1, name: 'Item 1', active: true },
      { id: 2, name: 'Item 2', active: false },
    ]);

    fs.writeFileSync(testJsonPath, testData);

    // Test custom transformation
    const transformation = `
      if (Array.isArray(data)) {
        return data.filter(item => item.active === true);
      }
      return data;
    `;

    // Apply transformation using private method
    await (provider as any).applyCustomTransformation(
      testJsonPath,
      transformation
    );

    // Read transformed file
    const transformedData = JSON.parse(fs.readFileSync(testJsonPath, 'utf8'));

    // Verify transformation was applied
    assert.strictEqual(
      Array.isArray(transformedData),
      true,
      'Result should be an array'
    );
    assert.strictEqual(
      transformedData.length,
      1,
      'Should filter out inactive items'
    );
    assert.strictEqual(
      transformedData[0].name,
      'Item 1',
      'Should keep correct items'
    );
  });
});
