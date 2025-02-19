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

  // Extract owner and repo from the repository URL
  const [owner, repo] = repoUrl
  .replace('git+https://github.com/', '')
  .replace('.git', '')
  .split('/');

  try {
    // Get the latest release
    const release = await octokit.repos.getLatestRelease({
      owner,
      repo
    });

    // Safely search for assets
    const windowsAsset = release.data.assets.find(a =>
      a.name.toLowerCase().includes('exe')
    );
    const macAsset = release.data.assets.find(a =>
      a.name.toLowerCase().includes('dmg')
    );

    const windowsDownloadUrl = windowsAsset
      ? windowsAsset.browser_download_url
      : 'N/A';
    const macDownloadUrl = macAsset
      ? macAsset.browser_download_url
      : 'N/A';

    // Generate markdown content
    const releaseNotes = `# Latest Release (v${version})

## Downloads
- [Windows Installer](${windowsDownloadUrl})
- [macOS Installer](${macDownloadUrl})

## Included Runtimes
- Python ${packageJson.runtimeVersions ? packageJson.runtimeVersions.python : 'N/A'}
- Node.js ${packageJson.runtimeVersions ? packageJson.runtimeVersions.nodejs : 'N/A'}
- Robot Framework ${packageJson.runtimeVersions ? packageJson.runtimeVersions.robotframework : 'N/A'}
- Jupyter Notebook ${packageJson.runtimeVersions ? packageJson.runtimeVersions.jupyter : 'N/A'}

${release.data.body}`;

    // Write release notes locally
    fs.writeFileSync('RELEASE.md', releaseNotes);

    // Try to get the current SHA of RELEASE.md (if it exists)
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

    // Commit the updated RELEASE.md
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