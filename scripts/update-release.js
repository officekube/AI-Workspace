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
    // Get all releases to find the draft release
    const { data: releases } = await octokit.repos.listReleases({
      owner,
      repo
    });

    // Find the draft release
    const draftRelease = releases.find(release => release.draft);

    if (!draftRelease) {
      throw new Error('Draft release not found');
    }

    // Delete existing assets if they exist
    for (const asset of draftRelease.assets) {
      await octokit.repos.deleteReleaseAsset({
        owner,
        repo,
        asset_id: asset.id
      });
    }

    // Re-fetch release after deleting assets
    const release = await octokit.repos.getRelease({
      owner,
      repo,
      release_id: draftRelease.id
    });

    // Filter assets using case-insensitive matching
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
      a.name.toLowerCase().endsWith('.appimage')
    );

    // Generate download links
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

    // Generate markdown content
    const releaseNotes = `# Latest Release (v${version})

## Downloads
- ${windowsDownload}
- ${macArmDownload}
- ${macIntelDownload}
- ${linuxDownload}

## Included Runtimes
- Python ${packageJson.runtimeVersions?.python || 'N/A'}
- Node.js ${packageJson.runtimeVersions?.nodejs || 'N/A'}
- Robot Framework ${packageJson.runtimeVersions?.robotframework || 'N/A'}
- Jupyter Notebook ${packageJson.runtimeVersions?.jupyter || 'N/A'}

${release.data.body || ''}`;

    // Update the draft release
    await octokit.repos.updateRelease({
      owner,
      repo,
      release_id: draftRelease.id,
      draft: false,  // Convert from draft to published
      body: releaseNotes,
      tag_name: draftRelease.tag_name,
      name: `Release v${version}`
    });

    // Update RELEASE.md
    try {
      const { data: existingFile } = await octokit.repos.getContent({
        owner,
        repo,
        path: 'RELEASE.md'
      });

      await octokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path: 'RELEASE.md',
        message: `Update release notes for v${version}`,
        content: Buffer.from(releaseNotes).toString('base64'),
        sha: existingFile.sha
      });
    }
    catch (error) {
      if (error.status === 404) {
        // File doesn't exist, create it
        await octokit.repos.createOrUpdateFileContents({
          owner,
          repo,
          path: 'RELEASE.md',
          message: `Create release notes for v${version}`,
          content: Buffer.from(releaseNotes).toString('base64')
        });
      } else {
        throw error;
      }
    }

    console.log('Release notes updated successfully!');
  }
  catch (error) {
    console.error('Error updating release notes:', error);
    process.exit(1);
  }
}


updateReleaseNotes();