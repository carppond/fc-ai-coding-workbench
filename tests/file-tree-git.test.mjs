import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

// Use the project's compiler; no additional runner or TypeScript loader is required.
const source = readFileSync(new URL('../src/lib/fileTreeGit.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2021, module: ts.ModuleKind.ESNext },
});
const { buildGitDecorations, findProjectRoot, normalizePathKey } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`
);

test('each project decorates its own files even when another project is the active terminal', () => {
  const alpha = buildGitDecorations('/workspace/alpha', []);
  const beta = buildGitDecorations('/workspace/beta', [
    { path: 'nested/shared.ts', status: 'modified', staged: false },
  ]);
  assert.equal(alpha.gitStatusMap.get('/workspace/alpha/nested/shared.ts'), undefined);
  assert.equal(alpha.gitDirtyDirs.has('/workspace/alpha'), false);
  assert.equal(beta.gitStatusMap.get('/workspace/beta/nested/shared.ts').status, 'modified');
  assert.deepEqual([...beta.gitDirtyDirs], ['/workspace/beta/nested', '/workspace/beta']);
  assert.equal(beta.gitDirtyDirs.has('/workspace'), false);
});

test('native Windows paths and trailing separators resolve to the same decoration key', () => {
  const { gitStatusMap, gitDirtyDirs } = buildGitDecorations('C:\\workspace\\repo\\', [
    { path: 'src/file.ts', status: 'added', staged: true },
  ]);
  assert.equal(gitStatusMap.get(normalizePathKey('C:\\workspace\\repo\\src\\file.ts')).status, 'added');
  assert.equal(gitDirtyDirs.has(normalizePathKey('C:/workspace/repo/')), true);
  assert.equal(gitDirtyDirs.has('C:/workspace'), false);
});

test('worktree changes take precedence over index entries, and conflicts always win', () => {
  const index = { path: 'file.ts', status: 'added', staged: true };
  const worktree = { path: 'file.ts', status: 'modified', staged: false };
  const conflict = { path: 'file.ts', status: 'conflicted', staged: false };
  for (const entries of [[index, worktree], [worktree, index]]) {
    assert.equal(buildGitDecorations('/repo', entries).gitStatusMap.get('/repo/file.ts').status, 'modified');
  }
  for (const entries of [[conflict, index, worktree], [index, worktree, conflict]]) {
    assert.equal(buildGitDecorations('/repo', entries).gitStatusMap.get('/repo/file.ts').status, 'conflicted');
  }
});

test('file ownership uses directory boundaries and the deepest matching project', () => {
  const roots = ['/workspace/app/', '/workspace/app/nested', '/workspace/application'];
  assert.equal(findProjectRoot(roots, '/workspace/application/file.ts'), '/workspace/application');
  assert.equal(findProjectRoot(roots, '/workspace/app/nested/file.ts'), '/workspace/app/nested');
  assert.equal(findProjectRoot(roots, '/workspace/apple/file.ts'), undefined);
  assert.equal(findProjectRoot(['C:\\work\\repo\\'], 'C:/work/repo/file.ts'), 'C:\\work\\repo\\');
});
