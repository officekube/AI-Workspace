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

  const url = RUNTIME_URLS[platform].python;
  const fileName = path.basename(url);
  const downloadPath = path.join(pythonDir, fileName);

  await downloadFile(url, downloadPath);

  // Extract or install based on platform
  if (platform === 'windows') {
    await extract(downloadPath, { dir: pythonDir });
  } else {
    execSync(`sudo installer -pkg "${downloadPath}" -target /`);
  }

  // Install pip and required packages
  const pipCommand = platform === 'windows' ?
    'python -m ensurepip && python -m pip install --upgrade pip' :
    'python3 -m ensurepip && python3 -m pip install --upgrade pip';

  execSync(pipCommand, { cwd: pythonDir });
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
}

async function setupRobotFramework() {
  // Install Robot Framework using pip
  execSync('pip install robotframework==${RUNTIME_VERSIONS.robotframework}');
}

async function setupJupyter() {
  // Install Jupyter using pip
  execSync('pip install notebook==${RUNTIME_VERSIONS.jupyter}');
}

async function main() {
  const platform = process.platform === 'darwin' ? 'macos' : 'windows';

  try {
    console.log('Setting up Python...');
    await setupPython(platform);

    console.log('Setting up Node.js...');
    await setupNodejs(platform);

    console.log('Setting up Robot Framework...');
    await setupRobotFramework();

    console.log('Setting up Jupyter...');
    await setupJupyter();

    console.log('All runtimes downloaded and set up successfully!');
  } catch (error) {
    console.error('Error setting up runtimes:', error);
    process.exit(1);
  }
}

main();