import * as fs from 'fs';
import * as XLSX from 'xlsx';
import * as Papa from 'papaparse';
import { parse as csvParse } from 'csv-parse/sync';
import { stringify as csvStringify } from 'csv-stringify/sync';

// File type detection
export const detectFileType = (
  filePath: string
): 'csv' | 'json' | 'excel' | 'unknown' => {
  const extension = filePath.toLowerCase().split('.').pop() || '';

  switch (extension) {
    case 'csv':
      return 'csv';
    case 'json':
      return 'json';
    case 'xlsx':
    case 'xls':
      return 'excel';
    default:
      return 'unknown';
  }
};

// CSV to JSON conversion
export const csvToJson = async (
  csvString: string,
  preserveTypes = true
): Promise<any[]> => {
  return new Promise((resolve, reject) => {
    try {
      // Use PapaParse for more robust CSV parsing
      interface ParseResults {
        data: Record<string, any>[];
        errors: Array<{ message: string; [key: string]: any }>;
      }

      interface ParseError {
        message: string;
        [key: string]: any;
      }

      interface ParseConfig {
        header: boolean;
        dynamicTyping: boolean;
        skipEmptyLines: boolean;
        complete: (results: ParseResults) => void;
        error: (error: ParseError) => void;
      }

      Papa.parse(csvString, {
        header: true,
        dynamicTyping: preserveTypes, // Convert strings to numbers/booleans where appropriate
        skipEmptyLines: true,
        complete: (results: ParseResults) => {
          if (results.errors.length > 0) {
            reject(
              new Error(`CSV parsing error: ${results.errors[0].message}`)
            );
          } else {
            resolve(results.data);
          }
        },
        error: (error: ParseError) =>
          reject(new Error(`CSV parsing error: ${error.message}`)),
      } as ParseConfig);
    } catch (error) {
      reject(error);
    }
  });
};

// JSON to CSV conversion
export const jsonToCsv = async (
  jsonString: string,
  delimiter = ','
): Promise<string> => {
  try {
    const jsonData = JSON.parse(jsonString);

    // Handle array of objects
    if (Array.isArray(jsonData)) {
      if (jsonData.length === 0) {
        return '';
      }

      // Get all unique keys from all objects in the array
      const allKeys = new Set<string>();
      jsonData.forEach(item => {
        if (typeof item === 'object' && item !== null) {
          Object.keys(item).forEach(key => allKeys.add(key));
        }
      });

      // Flatten nested objects
      const flattenedData = jsonData.map(item => {
        const flatItem: Record<string, any> = {};

        // Initialize with all keys to ensure consistent columns
        [...allKeys].forEach(key => {
          flatItem[key] = '';
        });

        // Copy values to flattened item
        if (typeof item === 'object' && item !== null) {
          Object.entries(item).forEach(([key, value]) => {
            if (typeof value === 'object' && value !== null) {
              flatItem[key] = JSON.stringify(value);
            } else {
              flatItem[key] = value;
            }
          });
        }

        return flatItem;
      });

      // Use csv-stringify for reliable CSV generation
      return csvStringify(flattenedData, {
        header: true,
        delimiter,
      });
    }

    // Handle single object (convert to array with one item)
    else if (typeof jsonData === 'object' && jsonData !== null) {
      return await jsonToCsv(JSON.stringify([jsonData]), delimiter);
    }

    throw new Error(
      'Invalid JSON structure. Expected an array of objects or a single object.'
    );
  } catch (error) {
    throw new Error(
      `Failed to convert JSON to CSV: ${(error as Error).message}`
    );
  }
};

// Excel to JSON conversion
export const excelToJson = async (filePath: string): Promise<any[]> => {
  try {
    // Read Excel file
    const workbook = XLSX.readFile(filePath);
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];

    // Convert to JSON
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: null });
    return jsonData;
  } catch (error) {
    throw new Error(
      `Failed to convert Excel to JSON: ${(error as Error).message}`
    );
  }
};

// Excel to CSV conversion
export const excelToCsv = async (
  filePath: string,
  delimiter = ','
): Promise<string> => {
  try {
    // Read Excel file
    const workbook = XLSX.readFile(filePath);
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];

    // Convert to CSV
    const csvString = XLSX.utils.sheet_to_csv(worksheet, { FS: delimiter });
    return csvString;
  } catch (error) {
    throw new Error(
      `Failed to convert Excel to CSV: ${(error as Error).message}`
    );
  }
};

// JSON to Excel conversion
export const jsonToExcel = async (
  jsonFilePath: string,
  outputPath: string
): Promise<void> => {
  try {
    // Read JSON file
    const jsonString = fs.readFileSync(jsonFilePath, 'utf8');
    const jsonData = JSON.parse(jsonString);

    // Handle array of objects
    if (Array.isArray(jsonData)) {
      // Create workbook and worksheet
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(jsonData);

      // Add worksheet to workbook
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');

      // Write to file
      XLSX.writeFile(workbook, outputPath);
      return;
    }

    // Handle single object (convert to array with one item)
    else if (typeof jsonData === 'object' && jsonData !== null) {
      return await jsonToExcel(JSON.stringify([jsonData]), outputPath);
    }

    throw new Error(
      'Invalid JSON structure. Expected an array of objects or a single object.'
    );
  } catch (error) {
    throw new Error(
      `Failed to convert JSON to Excel: ${(error as Error).message}`
    );
  }
};

// CSV to Excel conversion
export const csvToExcel = async (
  csvFilePath: string,
  outputPath: string
): Promise<void> => {
  try {
    // Read CSV file
    const csvString = fs.readFileSync(csvFilePath, 'utf8');

    // Use PapaParse to convert CSV to array of objects
    const jsonData = await new Promise<any[]>((resolve, reject) => {
      interface ParsingResults {
        data: Record<string, any>[];
        errors: Array<{
          message: string;
          [key: string]: any;
        }>;
      }

      interface ParsingError {
        message: string;
        [key: string]: any;
      }

      interface ParsingConfig {
        header: boolean;
        dynamicTyping: boolean;
        skipEmptyLines: boolean;
        complete: (results: ParsingResults) => void;
        error: (error: ParsingError) => void;
      }

      Papa.parse<Record<string, any>>(csvString, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: (results: ParsingResults): void => {
          if (results.errors.length > 0) {
            reject(
              new Error(`CSV parsing error: ${results.errors[0].message}`)
            );
          } else {
            resolve(results.data);
          }
        },
        error: (error: ParsingError): void => reject(error),
      } as ParsingConfig);
    });

    // Create workbook and worksheet
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(jsonData);

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');

    // Write to file
    XLSX.writeFile(workbook, outputPath);
  } catch (error) {
    throw new Error(
      `Failed to convert CSV to Excel: ${(error as Error).message}`
    );
  }
};

// Web worker creation for heavy processing tasks
export const createWebWorker = async (
  operation: string,
  data: string
): Promise<any> => {
  // In a real extension, this would create a web worker
  // However, VS Code extensions can't directly use web workers in the extension host process
  // For now, we'll simulate a worker with a Promise
  // In a production extension, you'd use the VS Code API's createWebviewPanel to run web workers
  return new Promise((resolve, reject) => {
    try {
      setTimeout(() => {
        switch (operation) {
          case 'csvToJson':
            csvToJson(data)
              .then(result => resolve(result))
              .catch(error => reject(error));
            break;
          case 'jsonToCsv':
            jsonToCsv(data)
              .then(result => resolve(result))
              .catch(error => reject(error));
            break;
          default:
            reject(new Error(`Unknown operation: ${operation}`));
        }
      }, 0);
    } catch (error) {
      reject(error);
    }
  });
};
