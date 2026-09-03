import { spawn } from 'node:child_process';

const isWindows = process.platform === 'win32';
const npm = isWindows ? 'npm.cmd' : 'npm';
const repositoryName = process.env.GITHUB_REPOSITORY?.split('/').pop() ?? 'CharacterVault';
const basePath = process.env.VITE_BASE_PATH ?? `/${repositoryName}/`;
const command = isWindows ? process.env.ComSpec ?? 'cmd.exe' : npm;
const args = isWindows
  ? ['/d', '/s', '/c', npm, 'run', 'build:site']
  : ['run', 'build:site'];

const child = spawn(command, args, {
  stdio: 'inherit',
  shell: false,
  env: {
    ...process.env,
    VITE_BASE_PATH: basePath,
  },
});

child.on('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});

child.on('exit', (code) => {
  if (code !== 0) {
    process.exitCode = code ?? 1;
  }
});
