import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { tmpdir } from 'os';
import { applyYamlTransformations } from '../transformations';

// Define interfaces for type checking
interface TestUser {
  id: number;
  name: string;
  active: boolean;
  [key: string]: any; // Allow additional properties for transformed data
}

interface TestItem {
  id: number;
  name: string;
  [key: string]: any; // Allow additional properties for transformed data
}

suite('DataMorph Transformations Tests', () => {
  let tempDir: string;

  // Set up temporary directory for test outputs
  suiteSetup(() => {
    tempDir = path.join(tmpdir(), 'datamorph-transform-tests-' + Date.now());
    fs.mkdirSync(tempDir, { recursive: true });
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

  test('Apply filter transformation', async () => {
    // Create test YAML file for filtering active users
    const filterYamlContent = `
transformations:
  - name: "Filter Active Users"
    enabled: true
    condition: "data.active === true"
`;

    const filterYamlPath = path.join(tempDir, 'filter-test.yaml');
    fs.writeFileSync(filterYamlPath, filterYamlContent);

    // Test data
    const testData: TestUser[] = [
      { id: 1, name: 'User 1', active: true },
      { id: 2, name: 'User 2', active: false },
      { id: 3, name: 'User 3', active: true },
    ];

    // Apply transformation
    const result = (await applyYamlTransformations(
      testData,
      filterYamlPath
    )) as TestUser[];

    // Verify results
    assert.strictEqual(
      Array.isArray(result),
      true,
      'Result should be an array'
    );
    assert.strictEqual(result.length, 2, 'Should filter out inactive users');
    assert.strictEqual(
      result.every(item => item.active === true),
      true,
      'All remaining items should be active'
    );
  });

  test('Apply mapping transformation', async () => {
    // Create test YAML file for field mapping
    const mappingYamlContent = `
transformations:
  - name: "Rename Fields"
    enabled: true
    mapping:
      fullName: "name"
      isEnabled: "active"
`;

    const mappingYamlPath = path.join(tempDir, 'mapping-test.yaml');
    fs.writeFileSync(mappingYamlPath, mappingYamlContent);

    // Test data
    const testData: TestUser[] = [
      { id: 1, name: 'User 1', active: true },
      { id: 2, name: 'User 2', active: false },
    ];

    // Apply transformation
    const result = (await applyYamlTransformations(
      testData,
      mappingYamlPath
    )) as any[];

    // Verify results
    assert.strictEqual(
      result[0].fullName,
      'User 1',
      'Field should be mapped to new name'
    );
    assert.strictEqual(
      result[0].isEnabled,
      true,
      'Boolean field should be mapped correctly'
    );
    assert.strictEqual(
      result[1].fullName,
      'User 2',
      'Field should be mapped for all items'
    );
  });

  test('Apply calculated field transformation', async () => {
    // Create test YAML file for calculated fields
    const calcYamlContent = `
transformations:
  - name: "Add Calculated Field"
    enabled: true
    calculate:
      field: "displayName"
      expression: "'User: ' + data.name"
`;

    const calcYamlPath = path.join(tempDir, 'calc-test.yaml');
    fs.writeFileSync(calcYamlPath, calcYamlContent);

    // Test data
    const testData: TestUser[] = [
      { id: 1, name: 'Alice', active: true },
      { id: 2, name: 'Bob', active: false },
    ];

    // Apply transformation
    const result = (await applyYamlTransformations(
      testData,
      calcYamlPath
    )) as any[];

    // Verify results
    assert.strictEqual(
      result[0].displayName,
      'User: Alice',
      'Should add calculated field'
    );
    assert.strictEqual(
      result[1].displayName,
      'User: Bob',
      'Should calculate for all items'
    );
  });

  test('Apply multiple transformations', async () => {
    // Create test YAML file with multiple transformation types
    const combinedYamlContent = `
transformations:
  - name: "Filter Active Users"
    enabled: true
    condition: "data.active === true"

  - name: "Rename Fields"
    enabled: true
    mapping:
      fullName: "name"

  - name: "Add Calculated Field"
    enabled: true
    calculate:
      field: "status"
      expression: "'Status: ' + (data.active ? 'Active' : 'Inactive')"
`;

    const combinedYamlPath = path.join(tempDir, 'combined-test.yaml');
    fs.writeFileSync(combinedYamlPath, combinedYamlContent);

    // Test data
    const testData: TestUser[] = [
      { id: 1, name: 'User 1', active: true },
      { id: 2, name: 'User 2', active: false },
      { id: 3, name: 'User 3', active: true },
    ];

    // Apply transformation
    const result = (await applyYamlTransformations(
      testData,
      combinedYamlPath
    )) as any[];

    // Verify results
    assert.strictEqual(result.length, 2, 'Should filter out inactive users');
    assert.strictEqual(result[0].fullName, 'User 1', 'Should rename fields');
    assert.strictEqual(
      result[0].status,
      'Status: Active',
      'Should add calculated fields'
    );
  });

  test('Skip disabled transformations', async () => {
    // Create test YAML file with disabled transformation
    const disabledYamlContent = `
transformations:
  - name: "This should be skipped"
    enabled: false
    calculate:
      field: "shouldNotExist"
      expression: "'This should not be added'"

  - name: "This should run"
    enabled: true
    calculate:
      field: "shouldExist"
      expression: "'This should be added'"
`;

    const disabledYamlPath = path.join(tempDir, 'disabled-test.yaml');
    fs.writeFileSync(disabledYamlPath, disabledYamlContent);

    // Test data
    const testData: TestItem = { id: 1, name: 'Test' };

    // Apply transformation
    const result = (await applyYamlTransformations(
      testData,
      disabledYamlPath
    )) as any;

    // Verify results
    assert.strictEqual(
      result.shouldNotExist,
      undefined,
      'Disabled transformation should be skipped'
    );
    assert.strictEqual(
      result.shouldExist,
      'This should be added',
      'Enabled transformation should run'
    );
  });

  test('Handle invalid YAML file', async () => {
    // Create invalid YAML file
    const invalidYamlContent = `
transformations:
  - This is not valid YAML
    name: Broken
    condition:
`;

    const invalidYamlPath = path.join(tempDir, 'invalid-test.yaml');
    fs.writeFileSync(invalidYamlPath, invalidYamlContent);

    // Test data
    const testData: TestItem = { id: 1, name: 'Test' };

    // Apply transformation
    try {
      await applyYamlTransformations(testData, invalidYamlPath);
      assert.fail('Should throw error for invalid YAML');
    } catch (error) {
      assert.strictEqual(error instanceof Error, true, 'Should throw an error');
      assert.strictEqual(
        (error as Error).message.includes(
          'Failed to apply YAML transformations'
        ),
        true,
        'Error message should mention YAML transformations'
      );
    }
  });
});
