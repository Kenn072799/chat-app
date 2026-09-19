const { spawn } = require('child_process');

function startWorkspace(workspaceName) {
  const child = spawn(process.execPath, [process.env.npm_execpath, 'run', 'dev', '--workspace', workspaceName], {
    stdio: 'inherit',
    shell: false,
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.exit(1);
    }

    if (code && code !== 0) {
      process.exit(code);
    }
  });

  return child;
}

const serverProcess = startWorkspace('server');
const clientProcess = startWorkspace('client');

function shutdown() {
  serverProcess.kill();
  clientProcess.kill();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
