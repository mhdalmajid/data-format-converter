import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

/**
 * Transformation rule types
 */
interface TransformationRule {
  name: string;
  enabled?: boolean;
}

interface FilterRule extends TransformationRule {
  condition: string;
}

interface MapRule extends TransformationRule {
  mapping: Record<string, string>; // newFieldName: existingFieldName
}

interface CalculatedFieldRule extends TransformationRule {
  calculate: {
    field: string;
    expression: string;
  };
}

interface YamlTransformConfig {
  transformations: (FilterRule | MapRule | CalculatedFieldRule)[];
}

/**
 * Apply transformations defined in a YAML file to the data
 * @param data The data to transform
 * @param yamlFilePath The path to the YAML transformation file
 */
export async function applyYamlTransformations<T>(
  data: T,
  yamlFilePath: string
): Promise<T> {
  try {
    // Read and parse YAML file
    const yamlContent = fs.readFileSync(yamlFilePath, 'utf8');
    const config = yaml.load(yamlContent) as YamlTransformConfig;

    if (!config.transformations || !Array.isArray(config.transformations)) {
      throw new Error(
        'Invalid YAML transformation file: missing or invalid transformations array'
      );
    }

    let result = data;

    // Apply each transformation in order
    for (const rule of config.transformations) {
      if (rule.enabled === false) {
        continue; // Skip disabled rules
      }

      // Apply filter rules
      if ('condition' in rule) {
        result = applyFilterRule(result, rule.condition);
      }

      // Apply mapping rules
      else if ('mapping' in rule) {
        result = applyMappingRule(result, rule.mapping);
      }

      // Apply calculated field rules
      else if ('calculate' in rule) {
        result = applyCalculationRule(
          result,
          rule.calculate.field,
          rule.calculate.expression
        );
      }
    }

    return result;
  } catch (error) {
    throw new Error(
      `Failed to apply YAML transformations: ${(error as Error).message}`
    );
  }
}

/**
 * Apply a filter rule to the data
 * @param data The data to filter
 * @param condition The filter condition as a JavaScript expression
 */
function applyFilterRule<T>(data: T, condition: string): T {
  try {
    if (Array.isArray(data)) {
      // Create a function that evaluates the condition for each item
      const filterFn = new Function('data', `return ${condition};`);
      return data.filter(item => filterFn(item)) as unknown as T;
    }
    return data;
  } catch (error) {
    throw new Error(`Failed to apply filter rule: ${(error as Error).message}`);
  }
}

/**
 * Apply a field mapping rule to the data
 * @param data The data to transform
 * @param mapping The field mapping (newField: oldField)
 */
function applyMappingRule<T>(data: T, mapping: Record<string, string>): T {
  try {
    if (Array.isArray(data)) {
      return data.map(item => {
        const newItem = { ...item };
        for (const [newField, oldField] of Object.entries(mapping)) {
          if (oldField in newItem) {
            newItem[newField] = newItem[oldField];
            // Don't delete the original field as it might be used by other transformations
          }
        }
        return newItem;
      }) as unknown as T;
    } else if (typeof data === 'object' && data !== null) {
      const newData = { ...(data as object) } as Record<string, any>;
      for (const [newField, oldField] of Object.entries(mapping)) {
        if (oldField in newData) {
          newData[newField] = newData[oldField];
        }
      }
      return newData as unknown as T;
    }
    return data;
  } catch (error) {
    throw new Error(
      `Failed to apply mapping rule: ${(error as Error).message}`
    );
  }
}

/**
 * Apply a calculated field rule to the data
 * @param data The data to transform
 * @param fieldName The name of the calculated field
 * @param expression The JavaScript expression that calculates the field value
 */
function applyCalculationRule<T>(
  data: T,
  fieldName: string,
  expression: string
): T {
  try {
    // Create a function that evaluates the expression for an item
    const calculateFn = new Function('data', `return ${expression};`);

    if (Array.isArray(data)) {
      return data.map(item => {
        const newItem = { ...item };
        newItem[fieldName] = calculateFn(newItem);
        return newItem;
      }) as unknown as T;
    } else if (typeof data === 'object' && data !== null) {
      const newData = { ...(data as object) } as Record<string, any>;
      newData[fieldName] = calculateFn(newData);
      return newData as unknown as T;
    }
    return data;
  } catch (error) {
    throw new Error(
      `Failed to apply calculation rule: ${(error as Error).message}`
    );
  }
}

/**
 * Open a file picker to select a YAML transformation file
 */
export async function selectYamlTransformFile(): Promise<string | undefined> {
  const options: vscode.OpenDialogOptions = {
    canSelectMany: false,
    openLabel: 'Select YAML Transformation File',
    filters: {
      'YAML Files': ['yaml', 'yml'],
    },
  };

  const fileUri = await vscode.window.showOpenDialog(options);
  if (fileUri && fileUri[0]) {
    return fileUri[0].fsPath;
  }
  return undefined;
}

/**
 * Create a new YAML transformation file with template content
 * @param targetFolder The folder where the file should be created
 */
export async function createYamlTransformTemplate(
  targetFolder: string
): Promise<string | undefined> {
  const fileName = await vscode.window.showInputBox({
    prompt: 'Enter a name for the transformation file',
    value: 'data-transform.yaml',
  });

  if (!fileName) {
    return undefined;
  }

  const filePath = path.join(targetFolder, fileName);

  // Check if file already exists
  if (fs.existsSync(filePath)) {
    const overwrite = await vscode.window.showWarningMessage(
      `File ${fileName} already exists. Overwrite?`,
      'Yes',
      'No'
    );
    if (overwrite !== 'Yes') {
      return undefined;
    }
  }

  // Template content for a new transformation file
  const templateContent = `# DataMorph Transformation Rules
# This file defines how data should be transformed during conversion

transformations:
  - name: "Filter Active Records"
    enabled: true
    condition: "data.isActive === true"

  - name: "Rename Fields"
    enabled: true
    mapping:
      # Format: newFieldName: existingFieldName
      userName: "name"
      userEmail: "email"

  - name: "Add Calculated Field"
    enabled: true
    calculate:
      field: "displayName"
      expression: "data.firstName + ' ' + data.lastName"
`;

  try {
    fs.writeFileSync(filePath, templateContent, 'utf8');
    return filePath;
  } catch (error) {
    vscode.window.showErrorMessage(
      `Failed to create transformation file: ${(error as Error).message}`
    );
    return undefined;
  }
}
