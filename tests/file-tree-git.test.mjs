import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Use the project's compiler; no additional runner or TypeScript loader is required.
const source = readFileSync(new URL('../src/lib/fileTreeGit.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2021, module: ts.ModuleKind.ESNext },
});
const { buildGitDecorations, findProjectRoot, normalizePathKey, fileNameFromPath, parentDirectory, joinProjectPath } = await import(
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
  assert.equal(gitDirtyDirs.has(normalizePathKey('C:/workspace')), false);
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

test('file labels preserve POSIX backslashes and identify native Windows basenames', () => {
  assert.equal(fileNameFromPath('C:\\Work\\拾光\\file.ts'), 'file.ts');
  assert.equal(fileNameFromPath('C:/Work\\拾光/'), '拾光');
  assert.equal(fileNameFromPath('\\\\server\\share\\repo\\'), 'repo');
  assert.equal(fileNameFromPath('\\\\?\\C:\\Work\\image.png'), 'image.png');
  assert.equal(fileNameFromPath('/work/file\\name.ts'), 'file\\name.ts');
  assert.equal(fileNameFromPath('C:\\'), 'C:\\');
  assert.equal(fileNameFromPath('\\\\?\\C:\\'), '\\\\?\\C:\\');
  assert.equal(fileNameFromPath('file\\name.ts'), 'file\\name.ts');
});

test('root parents stay absolute when creating, renaming, or refreshing their children', () => {
  assert.equal(parentDirectory('/file.ts'), '/');
  assert.equal(parentDirectory('/'), '/');
  assert.equal(parentDirectory('C:\\file.ts'), 'C:\\');
  assert.equal(parentDirectory('C:\\'), 'C:\\');
  assert.equal(parentDirectory('C:/folder/'), 'C:/');
  assert.equal(parentDirectory('\\\\server\\share\\file.ts'), '\\\\server\\share\\');
  assert.equal(parentDirectory('\\\\server\\share'), '\\\\server\\share');
  assert.equal(parentDirectory('\\\\?\\UNC\\server\\share\\file.ts'), '\\\\?\\UNC\\server\\share\\');
  assert.equal(parentDirectory('\\\\?\\C:\\file.ts'), '\\\\?\\C:\\');
  assert.equal(parentDirectory('/work/dir\\name/file.ts'), '/work/dir\\name');
  assert.equal(parentDirectory('file.ts'), '');
});

test('search and Git relative paths open under their original project spelling', () => {
  const project = '\\\\?\\C:\\MixedCase\\Repo\\';
  const fullPath = joinProjectPath(project, 'src/nested\\file.ts');
  assert.equal(fullPath, '\\\\?\\C:\\MixedCase\\Repo\\src\\nested\\file.ts');
  assert.equal(fileNameFromPath(fullPath), 'file.ts');
  assert.equal(findProjectRoot([project], fullPath), project);
  assert.equal(joinProjectPath(parentDirectory('C:\\old.ts'), 'new.ts'), 'C:\\new.ts');
  assert.equal(joinProjectPath('\\\\server\\share\\', 'src/file.ts'), '\\\\server\\share\\src\\file.ts');
  assert.equal(joinProjectPath('/', 'file.ts'), '/file.ts');
  assert.equal(joinProjectPath('/Work\\Folder/', 'src/file\\name.ts'), '/Work\\Folder/src/file\\name.ts');
});

test('Windows aliases select the deepest original root without crossing drive or share boundaries', () => {
  const roots = ['C:\\', 'C:\\Work\\Repo\\', 'C:\\Work\\Repo\\Nested'];
  assert.equal(findProjectRoot(roots, '\\\\?\\c:\\WORK\\repo\\nested\\file.ts'), roots[2]);
  assert.equal(findProjectRoot(roots, 'c:/work/repository/file.ts'), roots[0]);
  assert.equal(findProjectRoot(roots, 'D:/work/repo/file.ts'), undefined);
  const unc = '\\\\Server\\Share\\Repo\\';
  assert.equal(findProjectRoot([unc], '//server/share/repo/file.ts'), unc);
  assert.equal(findProjectRoot([unc], '\\\\?\\UNC\\SERVER\\SHARE\\REPO\\file.ts'), unc);
  assert.equal(findProjectRoot([unc], '\\\\server\\share-other\\repo\\file.ts'), undefined);
  assert.equal(findProjectRoot(['/Work/Repo'], '/work/repo/file.ts'), undefined);
  assert.equal(findProjectRoot(['/work/dir\\name'], '/work/dir/name/file.ts'), undefined);
  assert.equal(findProjectRoot(['/'], '\\\\server\\share\\file.ts'), undefined);
});

test('drive and UNC root decorations aggregate to the root, not above it', () => {
  const drive = buildGitDecorations('C:\\', [
    { path: 'Dir/file.ts', status: 'modified', staged: false },
  ]);
  assert.deepEqual([...drive.gitDirtyDirs], ['c:/dir', 'c:/']);
  const unc = buildGitDecorations('\\\\?\\UNC\\Server\\Share\\', [
    { path: 'Dir/file.ts', status: 'modified', staged: false },
  ]);
  assert.equal(unc.gitStatusMap.get(normalizePathKey('\\\\server\\SHARE\\dir\\FILE.ts')).status, 'modified');
  assert.deepEqual([...unc.gitDirtyDirs], ['//server/share/dir', '//server/share']);
  const posix = buildGitDecorations('/Work/Repo', [
    { path: 'dir\\name/file.ts', status: 'modified', staged: false },
  ]);
  assert.equal(posix.gitStatusMap.has('/Work/Repo/dir\\name/file.ts'), true);
  assert.equal(posix.gitStatusMap.has('/work/repo/dir/name/file.ts'), false);
  assert.deepEqual([...posix.gitDirtyDirs], ['/Work/Repo/dir\\name', '/Work/Repo']);
});

test('opening a Windows path alias reuses the saved project without rewriting history or its IO path', async () => {
  const existing = { id: 'existing', name: 'Custom name', path: 'C:\\Work\\Repo', last_opened: 1 };
  const duplicate = { id: 'legacy', name: 'Legacy duplicate', path: 'c:/work/repo/', last_opened: 0 };
  let selected = '\\\\?\\c:\\WORK\\REPO\\';
  const created = [];
  const ipc = {
    updateProjectLastOpened: async () => {},
    setSetting: async () => {},
    createProject: async (path, name) => {
      const project = { id: 'new', path, name, last_opened: 2 };
      created.push(project);
      return project;
    },
  };
  const storeSource = readFileSync(new URL('../src/stores/projectStore.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(storeSource, {
    compilerOptions: { target: ts.ScriptTarget.ES2021, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const exports = {};
  runInNewContext(compiled, {
    exports,
    console,
    require: (name) => {
      if (name === '../lib/fileTreeGit') return { fileNameFromPath, normalizePathKey };
      if (name === '../ipc/commands') return ipc;
      if (name === '@tauri-apps/plugin-dialog') return { open: async () => selected };
      if (name === 'zustand') return { create: (initialize) => {
        let state;
        const setState = (update) => { state = { ...state, ...(typeof update === 'function' ? update(state) : update) }; };
        const getState = () => state;
        state = initialize(setState, getState);
        return { getState, setState };
      } };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  const store = exports.useProjectStore;
  store.setState({ projects: [existing, duplicate] });
  await store.getState().openProject();
  assert.equal(created.length, 0);
  assert.equal(store.getState().activeProject, existing);
  assert.equal(store.getState().gitContextPath, existing.path);
  assert.deepEqual(store.getState().projects, [existing, duplicate]);
  assert.equal(store.getState().selectedProjectIds.has(existing.id), true);

  selected = 'D:\\Other\\拾光\\';
  await store.getState().openProject();
  assert.equal(created[0].name, '拾光');
  assert.equal(created[0].path, selected);
  assert.equal(store.getState().projects.includes(duplicate), true);
});
