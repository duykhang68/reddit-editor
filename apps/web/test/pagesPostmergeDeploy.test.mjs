import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const workflow = readFileSync(
  new URL('../../../.github/workflows/pages-preview.yml', import.meta.url),
  'utf8'
);

test('Pages release is retriggered after successful main CI dispatch', () => {
  assert.match(workflow, /workflow_run:\s*\n\s*workflows: \['CI · Quality Gate'\]\s*\n\s*types: \[completed\]/);
  assert.match(workflow, /workflow_run\.conclusion == 'success'/);
  assert.match(workflow, /workflow_run\.head_branch == 'main'/);
});

test('Pages checks out the exact tested workflow_run head SHA', () => {
  assert.match(workflow, /ref: \$\{\{ github\.event_name == 'workflow_run' && github\.event\.workflow_run\.head_sha \|\| github\.sha \}\}/);
  assert.match(workflow, /EXPECTED_SHA: \$\{\{ github\.event_name == 'workflow_run' && github\.event\.workflow_run\.head_sha \|\| github\.sha \}\}/);
});

test('Pages refuses stale main and regression to QA redirect', () => {
  assert.match(workflow, /git ls-remote https:\/\/github\.com\/\$\{\{ github\.repository \}\}\.git refs\/heads\/main/);
  assert.match(workflow, /STAGING_OUTDATED: main has moved/);
  assert.match(workflow, /ROLLBACK_QA_REDIRECT_REGRESSION/);
  assert.match(workflow, /grep -qi 'http-equiv="refresh"'/);
});

test('Pages never deploys directly from unverified pull requests', () => {
  assert.match(workflow, /if: github\.event_name != 'pull_request' && github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /needs: validate-preview/);
  assert.match(workflow, /npm run check/);
  assert.match(workflow, /node scripts\/prepare-pages-preview\.mjs/);
});
