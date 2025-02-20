const axios = require('axios');
const fs = require('fs');
const path = require('path');
const extract = require('extract-zip');
const { spawn } = require('child_process');

// Import runtimeVersions from package.json.
const packageJson = require(path.join(__dirname, '..', 'package.json'));
const RUNTIME_VERSIONS = packageJson.runtimeVersions;

// Define URLs for each platform.
const RUNTIME_URLS = {
  windows: {
    python: `https://www.python.org/ftp/python/${RUNTIME_VERSIONS.python}/python-${RUNTIME_VERSIONS.python}-amd64.exe`,
    nodejs: `https://nodejs.org/dist/v${RUNTIME_VERSIONS.nodejs}/node-v${RUNTIME_VERSIONS.nodejs}-win-x64.zip`
  },
  macos: {
    python: `https://www.python.org/ftp/python/${RUNTIME_VERSIONS.python}/python-${RUNTIME_VERSIONS.python}-macos11.pkg`,
    nodejs: `https://nodejs.org/dist/v${RUNTIME_VERSIONS.nodejs}/node-v${RUNTIME_VERSIONS.nodejs}-darwin-x64.tar.gz`
  },
  linux: {
    // For Linux, we assume system python is available.
    nodejs: `https://nodejs.org/dist/v${RUNTIME_VERSIONS.nodejs}/node-v${RUNTIME_VERSIONS.nodejs}-linux-x64.tar.xz`
  }
};

const RUNTIMES_DIR = path.join(__dirname, '../resources/runtimes');

async function downloadFile(url, outputPath) {
  console.log(`Downloading ${url} to ${outputPath}`);
  const response = await axios({
    url,
    method: 'GET',
    responseType: 'stream'
  });
  const writer = fs.createWriteStream(outputPath);
  response.data.pipe(writer);
  return new Promise((resolve, reject) => {
    writer.on('finish', () => {
      writer.close();
      resolve();
    });
    writer.on('error', reject);
  });
}

function execCommand(command, options = {}) {
  return new Promise((resolve, reject) => {
    console.log(`Executing command: ${command}`);
    const isWindows = process.platform === 'win32';
    if (isWindows) {
      // Create a temporary batch file with "call" to avoid interactive prompts.
      const batchFile = path.join(RUNTIMES_DIR, 'temp.bat');
      fs.writeFileSync(batchFile, `@echo off\ncall ${command}\n`, 'utf8');
      const proc = spawn('cmd', ['/S', '/C', batchFile], {
        ...options,
        shell: true,
        env: {
          ...process.env,
          PYTHONIOENCODING: 'utf-8',
          PYTHONUTF8: '1'
        }
      });
      proc.stdout?.on('data', (data) => console.log(data.toString()));
      proc.stderr?.on('data', (data) => console.error(data.toString()));
      proc.on('close', (code) => {
        try {
          fs.unlinkSync(batchFile);
        }
        catch (err) {
          console.warn('Could not delete temporary batch file:', err);
        }
        code === 0 ? resolve() : reject(new Error(`Command failed with exit code ${code}`));
      });
      proc.on('error', (err) => {
        try {
          fs.unlinkSync(batchFile);
        }
        catch (error) {
          console.warn('Could not delete temporary batch file:', error);
        }
        reject(err);
      });
    } else {
      const proc = spawn('bash', ['-c', command], { ...options, shell: false });
      proc.stdout?.on('data', (data) => console.log(data.toString()));
      proc.stderr?.on('data', (data) => console.error(data.toString()));
      proc.on('close', (code) => {
        code === 0 ? resolve() : reject(new Error(`Command failed with exit code ${code}`));
      });
      proc.on('error', (err) => {
        reject(err);
      });
    }
  });
}


async function setupPython(platform) {
  try {
    const pythonDir = path.join(RUNTIMES_DIR, 'python');
    fs.mkdirSync(pythonDir, { recursive: true });
    if (platform === 'windows') {
      const url = RUNTIME_URLS.windows.python;
      const fileName = path.basename(url);
      const downloadPath = path.join(pythonDir, fileName);
      console.log('Downloading Python installer...');
      await downloadFile(url, downloadPath);
      console.log('Installing Python...');
      // Run the installer silently.
      await execCommand(`"${downloadPath}" /quiet InstallAllUsers=0 PrependPath=1 Include_test=0 Include_pip=1 InstallLauncherAllUsers=0 TargetDir="${pythonDir}"`);
      await new Promise(resolve => setTimeout(resolve, 5000));
      console.log('Creating virtual environment...');
      await execCommand(`"${path.join(pythonDir, 'python.exe')}" -m venv "${path.join(pythonDir,
        'venv')}"`);
      await new Promise(resolve => setTimeout(resolve, 2000));
      console.log('Installing Python packages...');
      const venvPython = path.join(pythonDir, 'venv', 'Scripts', 'python.exe');
      await execCommand(`"${venvPython}" -m pip install --upgrade pip`);
      await execCommand(`"${venvPython}" -m pip install robotframework==${RUNTIME_VERSIONS.robotframework}`);
      await execCommand(`"${venvPython}" -m pip install notebook==${RUNTIME_VERSIONS.jupyter}`);
    } else {
      // For macOS and Linux, assume system Python3 is available.
      const venvPath = path.join(pythonDir, 'venv');
      await execCommand(`python3 -m venv "${venvPath}"`);
      const venvPip = path.join(venvPath, 'bin', 'pip');
      console.log('Installing Python packages...');
      await execCommand(`"${venvPip}" install --upgrade pip`);
      await execCommand(`"${venvPip}" install robotframework==${RUNTIME_VERSIONS.robotframework}`);
      await execCommand(`"${venvPip}" install notebook==${RUNTIME_VERSIONS.jupyter}`);
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
    } else if (platform === 'linux') {
      // Linux tarball is .tar.xz; use tar -xf.
      await execCommand(`tar -xf "${downloadPath}" -C "${nodeDir}"`);
    } else {
      // For macOS, use tar -xzf.
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
  let platform;
  if (process.platform === 'darwin') {
    platform = 'macos';
  } else if (process.platform === 'win32') {
    platform = 'windows';
  } else if (process.platform === 'linux') {
    platform = 'linux';
  } else {
    console.error('Unsupported platform:', process.platform);
    process.exit(1);
  }
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