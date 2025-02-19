const axios = require('axios');
const fs = require('fs');
const path = require('path');
const extract = require('extract-zip');
const { spawn } = require('child_process');

const RUNTIME_VERSIONS = {
  python: '3.11.0',
  nodejs: '18.16.0',
  robotframework: '6.1.1',
  jupyter: '7.0.0'
};

const RUNTIME_URLS = {
  windows: {
    python: `https://www.python.org/ftp/python/${RUNTIME_VERSIONS.python}/python-${RUNTIME_VERSIONS.python}-embed-amd64.zip`,
    nodejs: `https://nodejs.org/dist/v${RUNTIME_VERSIONS.nodejs}/node-v${RUNTIME_VERSIONS.nodejs}-win-x64.zip`,
  },
  macos: {
    python: `https://www.python.org/ftp/python/${RUNTIME_VERSIONS.python}/python-${RUNTIME_VERSIONS.python}-macos11.pkg`,
    nodejs: `https://nodejs.org/dist/v${RUNTIME_VERSIONS.nodejs}/node-v${RUNTIME_VERSIONS.nodejs}-darwin-x64.tar.gz`,
  }
};

const RUNTIMES_DIR = path.join(__dirname, '../resources/runtimes');

async function downloadFile(url, outputPath) {
  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream'
  });

  const writer = fs.createWriteStream(outputPath);
  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

function execCommand(command, options = {}) {
  return new Promise((resolve, reject) => {
    const isWindows = process.platform === 'win32';
    const [cmd, ...args] = isWindows ? ['cmd', '/C', command] : ['sh', '-c', command];

    const proc = spawn(cmd, isWindows ? ['/S', '/C', command] : args, {
      stdio: 'inherit',
      shell: false,
      ...options
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

async function setupPython(platform) {
  try {
    const pythonDir = path.join(RUNTIMES_DIR, 'python');
    fs.mkdirSync(pythonDir, { recursive: true });

    const venvPath = path.join(pythonDir, 'venv');
    console.log('Creating Python virtual environment...');

    if (platform === 'windows') {
      // For Windows, download the embedded distribution first
      const url = RUNTIME_URLS.windows.python;
      const fileName = path.basename(url);
      const downloadPath = path.join(pythonDir, fileName);

      console.log('Downloading Python embedded distribution...');
      await downloadFile(url, downloadPath);

      console.log('Extracting Python...');
      await extract(downloadPath, { dir: pythonDir });

      // Create batch script for setting up Python
      const setupScript = path.join(pythonDir, 'setup.bat');
      const setupContent = `@echo off
set PATH=${pythonDir};%PATH%
"${path.join(pythonDir, 'python.exe')}" -m venv "${venvPath}"
call "${path.join(venvPath, 'Scripts', 'activate.bat')}"
"${path.join(venvPath, 'Scripts', 'python.exe')}" -m pip install --upgrade pip
"${path.join(venvPath,
        'Scripts',
        'pip.exe')}" install robotframework==${RUNTIME_VERSIONS.robotframework}
"${path.join(venvPath, 'Scripts', 'pip.exe')}" install notebook==${RUNTIME_VERSIONS.jupyter}
`;
      fs.writeFileSync(setupScript, setupContent);

      // Execute setup script
      await execCommand(setupScript);

    } else {
      // For macOS, use system Python to create venv
      await execCommand(`python3 -m venv "${venvPath}"`);

      const venvPip = path.join(venvPath, 'bin', 'pip');

      console.log('Installing required packages...');
      await execCommand(`"${venvPip}" install --upgrade pip`);
      await execCommand(`"${venvPip}" install robotframework==${RUNTIME_VERSIONS.robotframework}`);
      await execCommand(`"${venvPip}" install notebook==${RUNTIME_VERSIONS.jupyter}`);
    }

    // Create activation scripts
    const activateContent = platform === 'windows' ?
      `@echo off\ncall "${path.join(venvPath, 'Scripts', 'activate.bat')}"` :
      `#!/bin/bash\nsource "${path.join(venvPath, 'bin', 'activate')}"`;

    const activateScript = platform === 'windows' ? 'activate.bat' : 'activate.sh';
    fs.writeFileSync(path.join(pythonDir, activateScript), activateContent);

    if (platform !== 'windows') {
      fs.chmodSync(path.join(pythonDir, activateScript), '755');
    }

    console.log('Python environment setup completed successfully!');
  }
  catch (error) {
    console.error('Failed to setup Python environment:', error);
    throw error;
  }
}

async function setupNodejs(platform) {
  try {
    const nodeDir = path.join(RUNTIMES_DIR, 'nodejs');
    fs.mkdirSync(nodeDir, { recursive: true });

    const url = RUNTIME_URLS[platform].nodejs;
    const fileName = path.basename(url);
    const downloadPath = path.join(nodeDir, fileName);

    console.log('Downloading Node.js...');
    await downloadFile(url, downloadPath);

    console.log('Extracting Node.js...');
    if (platform === 'windows') {
      await extract(downloadPath, { dir: nodeDir });
    } else {
      await execCommand(`tar -xzf "${downloadPath}" -C "${nodeDir}"`);
    }

    fs.unlinkSync(downloadPath);
    console.log('Node.js setup completed successfully!');
  }
  catch (error) {
    console.error('Failed to setup Node.js:', error);
    throw error;
  }
}

async function main() {
  const platform = process.platform === 'darwin' ? 'macos' : 'windows';

  try {
    console.log('Setting up Python...');
    await setupPython(platform);

    console.log('Setting up Node.js...');
    await setupNodejs(platform);

    console.log('All runtimes downloaded and set up successfully!');
  }
  catch (error) {
    console.error('Error setting up runtimes:', error);
    process.exit(1);
  }
}

main();