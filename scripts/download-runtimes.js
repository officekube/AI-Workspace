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
    python: `https://www.python.org/ftp/python/${RUNTIME_VERSIONS.python}/python-${RUNTIME_VERSIONS.python}-amd64.exe`,
    nodejs: `https://nodejs.org/dist/v${RUNTIME_VERSIONS.nodejs}/node-v${RUNTIME_VERSIONS.nodejs}-win-x64.zip`,
  },
  macos: {
    python: `https://www.python.org/ftp/python/${RUNTIME_VERSIONS.python}/python-${RUNTIME_VERSIONS.python}-macos11.pkg`,
    nodejs: `https://nodejs.org/dist/v${RUNTIME_VERSIONS.nodejs}/node-v${RUNTIME_VERSIONS.nodejs}-darwin-x64.tar.gz`,
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

    // For Windows, do not add extra quotes around the command.
    const proc = isWindows
      ? spawn('cmd', ['/S', '/C', command], { ...options, shell: true })
      : spawn('bash', ['-c', command], { ...options, shell: false });

    if (options.stdio !== 'inherit') {
      proc.stdout?.on('data', (data) => console.log(data.toString()));
      proc.stderr?.on('data', (data) => console.error(data.toString()));
    }

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

    if (platform === 'windows') {
      // For Windows, download the installer
      const url = RUNTIME_URLS.windows.python;
      const fileName = path.basename(url);
      const downloadPath = path.join(pythonDir, fileName);

      console.log('Downloading Python installer...');
      await downloadFile(url, downloadPath);

      if (!fs.existsSync(downloadPath)) {
        throw new Error('Python installer not downloaded correctly');
      }

      const fileStats = fs.statSync(downloadPath);
      if (fileStats.size === 0) {
        throw new Error('Python installer file is empty');
      }

      console.log('Installing Python...');
      const installCommand = `${downloadPath} /quiet InstallAllUsers=0 PrependPath=1 Include_test=0 Include_pip=1 InstallLauncherAllUsers=0 TargetDir=${pythonDir}`;
      await execCommand(installCommand);

      console.log('Creating virtual environment...');
      const pythonExe = path.join(pythonDir, 'python.exe');
      await execCommand(`${pythonExe} -m venv ${path.join(pythonDir, 'venv')}`);

      console.log('Installing Python packages...');
      const venvPython = path.join(pythonDir, 'venv', 'Scripts', 'python.exe');
      await execCommand(`${venvPython} -m pip install --upgrade pip`);
      await execCommand(`${venvPython} -m pip install robotframework==${RUNTIME_VERSIONS.robotframework}`);
      await execCommand(`${venvPython} -m pip install notebook==${RUNTIME_VERSIONS.jupyter}`);

    } else {
      // For macOS, use system python3 to create a virtual environment
      const venvPath = path.join(pythonDir, 'venv');
      await execCommand(`python3 -m venv "${venvPath}"`);

      const venvPip = path.join(venvPath, 'bin', 'pip');
      console.log('Installing Python packages...');
      await execCommand(`"${venvPip}" install --upgrade pip`);
      await execCommand(`"${venvPip}" install robotframework==${RUNTIME_VERSIONS.robotframework}`);
      await execCommand(`"${venvPip}" install notebook==${RUNTIME_VERSIONS.jupyter}`);
    }

    console.log('Python environment setup completed successfully!');
  } catch (error) {
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
  } catch (error) {
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
  } catch (error) {
    console.error('Error setting up runtimes:', error);
    process.exit(1);
  }
}

main();