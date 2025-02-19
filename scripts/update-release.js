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

    // Generate markdown content
    const releaseNotes = `# Latest Release (v${version})

## Downloads
- [Windows Installer](${release.data.assets.find(a => a.name.includes('exe')).browser_download_url})
- [macOS Installer](${release.data.assets.find(a => a.name.includes('dmg')).browser_download_url})

## Included Runtimes
- Python ${packageJson.runtimeVersions.python}
- Node.js ${packageJson.runtimeVersions.nodejs}
- Robot Framework ${packageJson.runtimeVersions.robotframework}
- Jupyter Notebook ${packageJson.runtimeVersions.jupyter}

${release.data.body}`;

    // Update RELEASE.md
    fs.writeFileSync('RELEASE.md', releaseNotes);

    // Commit and push the updated RELEASE.md
    await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: 'RELEASE.md',
      message: `Update release notes for v${version}`,
      content: Buffer.from(releaseNotes).toString('base64'),
      sha: (await octokit.repos.getContent({
        owner,
        repo,
        path: 'RELEASE.md'
      })).data.sha
    });

    console.log('Release notes updated successfully!');
  } catch (error) {
    console.error('Error updating release notes:', error);
    process.exit(1);
  }
}

updateReleaseNotes();