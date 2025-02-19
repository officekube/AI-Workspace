const axios = require('axios');
const fs = require('fs');
const path = require('path');
const extract = require('extract-zip');
const { execSync } = require('child_process');

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

async function setupPython(platform) {
  const pythonDir = path.join(RUNTIMES_DIR, 'python');
  fs.mkdirSync(pythonDir, { recursive: true });

  const venvPath = path.join(pythonDir, 'venv');
  console.log('Creating Python virtual environment...');

  try {
    // Create virtual environment
    execSync(`python3 -m venv "${venvPath}"`, { stdio: 'inherit' });

    // Get the path to the Python executable in the virtual environment
    const pythonBin = platform === 'windows' ?
      path.join(venvPath, 'Scripts', 'python.exe') :
      path.join(venvPath, 'bin', 'python3');

    const pipBin = platform === 'windows' ?
      path.join(venvPath, 'Scripts', 'pip.exe') :
      path.join(venvPath, 'bin', 'pip');

    // Upgrade pip in the virtual environment
    console.log('Upgrading pip in virtual environment...');
    execSync(`"${pythonBin}" -m pip install --upgrade pip`, { stdio: 'inherit' });

    // Install required packages in the virtual environment
    console.log('Installing Robot Framework...');
    execSync(`"${pipBin}" install robotframework==${RUNTIME_VERSIONS.robotframework}`,
      { stdio: 'inherit' });

    console.log('Installing Jupyter...');
    execSync(`"${pipBin}" install notebook==${RUNTIME_VERSIONS.jupyter}`, { stdio: 'inherit' });

    // Create activation scripts
    const activateContent = platform === 'windows' ?
      `@echo off\ncall "${path.join(venvPath, 'Scripts', 'activate.bat')}"` :
      `#!/bin/bash\nsource "${path.join(venvPath, 'bin', 'activate')}"`;

    const activateScript = platform === 'windows' ? 'activate.bat' : 'activate.sh';
    fs.writeFileSync(path.join(pythonDir, activateScript), activateContent);

    if (platform !== 'windows') {
      // Make the activation script executable on Unix-like systems
      fs.chmodSync(path.join(pythonDir, activateScript), '755');
    }

    console.log('Python environment setup completed successfully!');
  }
  catch (error) {
    console.error('Error setting up Python environment:', error);
    throw error;
  }
}

async function setupNodejs(platform) {
  const nodeDir = path.join(RUNTIMES_DIR, 'nodejs');
  fs.mkdirSync(nodeDir, { recursive: true });

  const url = RUNTIME_URLS[platform].nodejs;
  const fileName = path.basename(url);
  const downloadPath = path.join(nodeDir, fileName);

  await downloadFile(url, downloadPath);

  if (platform === 'windows') {
    await extract(downloadPath, { dir: nodeDir });
  } else {
    execSync(`tar -xzf "${downloadPath}" -C "${nodeDir}"`);
  }

  // Remove the archive after extraction
  fs.unlinkSync(downloadPath);
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