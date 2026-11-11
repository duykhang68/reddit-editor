import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const workflow = readFileSync(
  new URL('../../../.github/workflows/commit-taxonomy.yml', import.meta.url),
  'utf8'
);
const scriptSection = workflow.split('          script: |\n')[1];
assert.ok(scriptSection, 'Commit taxonomy must contain the github-script step');
const script = scriptSection
  .split('\n')
  .map(line => line.startsWith('            ') ? line.slice(12) : line)
  .join('\n');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const run = new AsyncFunction('github', 'context', 'core', 'process', script);

function mockGitHub() {
  const commit = { sha: 'a'.repeat(40), commit: { message: 'chore: initial editor migration' } };
  const calls = { list: 0, compare: 0, statuses: [] };
  const github = {
    rest: { repos: {
      listCommits: async () => {
        calls.list++;
        return { data: [commit] };
      },
      compareCommits: async () => {
        calls.compare++;
        return { data: { commits: [commit], total_commits: 1 } };
      },
      listPullRequestsAssociatedWithCommit: async () => ({ data: [] }),
      createCommitStatus: async input => { calls.statuses.push(input); }
    } },
    paginate: async (method, args) => (await method(args)).data
  };
  return { github, commit, calls };
}

async function classifyPush(before) {
  const { github, commit, calls } = mockGitHub();
  const context = {
    repo: { owner: 'example', repo: 'editor' },
    eventName: 'push',
    payload: { before },
    sha: commit.sha
  };
  const core = { info() {}, warning() {}, setFailed(message) { throw Error(message); } };
  await run(github, context, core, { env: {} });
  return calls;
}

test('initial branch push avoids comparing GitHub zero SHA', async () => {
  const calls = await classifyPush('0'.repeat(40));
  assert.equal(calls.list, 1);
  assert.equal(calls.compare, 0);
  assert.equal(calls.statuses.length, 1);
  assert.equal(calls.statuses[0].context, 'taxonomy/type:chore');
});

test('ordinary push retains commit comparison and classification', async () => {
  const calls = await classifyPush('b'.repeat(40));
  assert.equal(calls.list, 0);
  assert.equal(calls.compare, 1);
  assert.equal(calls.statuses.length, 1);
  assert.equal(calls.statuses[0].context, 'taxonomy/type:chore');
});
