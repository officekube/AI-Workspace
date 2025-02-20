const fs = require('fs');
const path = require('path');
const { Octokit } = require('@octokit/rest');

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
});

async function updateReleaseNotes() {
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const version = packageJson.version;
  const repoUrl = packageJson.repository.url;

  // Extract owner and repo from the repository URL.
  const [owner, repo] = repoUrl
  .replace('git+https://github.com/', '')
  .replace('.git', '')
  .split('/');

  try {
    // Get the latest release.
    const release = await octokit.repos.getLatestRelease({ owner, repo });

    // Filter assets using case-insensitive matching.
    const windowsAsset = release.data.assets.find(a =>
      a.name.toLowerCase().endsWith('.exe')
    );
    const macIntelAsset = release.data.assets.find(a =>
      a.name.toLowerCase().includes('x64') && a.name.toLowerCase().endsWith('.dmg')
    );
    const macArmAsset = release.data.assets.find(a =>
      a.name.toLowerCase().includes('arm64') && a.name.toLowerCase().endsWith('.dmg')
    );
    const linuxAsset = release.data.assets.find(a =>
      a.name.toLowerCase().endsWith('.appimage') || a.name.toLowerCase().endsWith('.deb')
    );

    const windowsDownload = windowsAsset
      ? `[Windows Installer](${windowsAsset.browser_download_url})`
      : 'Windows Installer (not available)';
    const macIntelDownload = macIntelAsset
      ? `[macOS Installer (Intel)](${macIntelAsset.browser_download_url})`
      : 'macOS Installer (Intel) (not available)';
    const macArmDownload = macArmAsset
      ? `[macOS Installer (Apple Silicon)](${macArmAsset.browser_download_url})`
      : 'macOS Installer (Apple Silicon) (not available)';
    const linuxDownload = linuxAsset
      ? `[Linux Installer](${linuxAsset.browser_download_url})`
      : 'Linux Installer (not available)';

    // Generate markdown content.
    const releaseNotes = `# Latest Release (v${version})

## Downloads
- ${windowsDownload}
- ${macArmDownload}
- ${macIntelDownload}
- ${linuxDownload}

## Included Runtimes
- Python ${packageJson.runtimeVersions ? packageJson.runtimeVersions.python : 'N/A'}
- Node.js ${packageJson.runtimeVersions ? packageJson.runtimeVersions.nodejs : 'N/A'}
- Robot Framework ${packageJson.runtimeVersions ? packageJson.runtimeVersions.robotframework : 'N/A'}
- Jupyter Notebook ${packageJson.runtimeVersions ? packageJson.runtimeVersions.jupyter : 'N/A'}

${release.data.body}`;

    // Write release notes locally.
    fs.writeFileSync('RELEASE.md', releaseNotes);

    // Get the current SHA of RELEASE.md (if it exists).
    let sha;
    try {
      const { data } = await octokit.repos.getContent({
        owner,
        repo,
        path: 'RELEASE.md'
      });
      sha = data.sha;
    }
    catch (e) {
      // File does not exist; leave sha undefined.
    }

    // Commit or update RELEASE.md.
    await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: 'RELEASE.md',
      message: `Update release notes for v${version}`,
      content: Buffer.from(releaseNotes).toString('base64'),
      sha
    });

    console.log('Release notes updated successfully!');
  }
  catch (error) {
    console.error('Error updating release notes:', error);
    process.exit(1);
  }
}

updateReleaseNotes();