# Trusted Publishing Setup for light-async-queue

This package is configured to use npm's trusted publishing feature, which allows secure publishing from GitHub Actions without long-lived npm tokens.

## What is Trusted Publishing?

Trusted publishing uses OpenID Connect (OIDC) to authenticate publish operations directly from CI/CD workflows. This eliminates the need for storing npm tokens and provides enhanced security through short-lived, cryptographically-signed credentials.

## Prerequisites

- npm CLI version 11.5.1 or later (included with Node.js 22.14.0+)
- GitHub repository with GitHub Actions enabled
- NPM account with publish permissions for `light-async-queue`

## Configuration Steps

### 1. Configure Trusted Publisher on npmjs.com

1. Navigate to [npmjs.com](https://www.npmjs.com/) and log in
2. Go to your package: **Packages** → **light-async-queue** → **Settings**
3. Scroll to the **Trusted Publisher** section
4. Click **GitHub Actions** under "Select your publisher"
5. Fill in the following details:
   - **Organization or user**: `gaikwadakshay79`
   - **Repository**: `light-async-queue`
   - **Workflow filename**: `publish.yml`
   - **Environment name**: _(leave blank)_
6. Click **Add Trusted Publisher**

### 2. Verify Workflow Configuration

The GitHub Actions workflow (`.github/workflows/publish.yml`) is already configured with:

- ✅ OIDC permissions (`id-token: write`)
- ✅ Node.js 24 (includes npm 11.5.1+)
- ✅ Registry URL configured
- ✅ No `NODE_AUTH_TOKEN` needed for publishing

### 3. Publishing a New Version

To publish a new version:

```bash
# Ensure you're on main branch with latest changes
git checkout main
git pull

# Update version in package.json and create changelog
pnpm version patch  # or minor, or major

# Push the tag to trigger the publish workflow
git push origin main --follow-tags
```

The workflow will:

1. Run linting and tests
2. Build the package
3. Create a test tarball
4. Publish to npm using OIDC authentication
5. Create a GitHub release

### 4. Automatic Provenance Generation

When publishing via trusted publishing, npm automatically generates provenance attestations for your package. This provides cryptographic proof of where and how the package was built.

Provenance is automatically enabled for:

- ✅ Public repositories
- ✅ Public packages
- ✅ OIDC-based publishing

Users can verify the provenance at: `https://www.npmjs.com/package/light-async-queue`

To disable provenance (not recommended), add to `package.json`:

```json
{
  "publishConfig": {
    "provenance": false
  }
}
```

## Security Best Practices

### Recommended: Restrict Token Access

Once trusted publishing is working, enhance security by restricting traditional token-based publishing:

1. Go to package **Settings** → **Publishing access**
2. Select **"Require two-factor authentication and disallow tokens"**
3. Click **Update Package Settings**

This ensures only trusted publisher workflows can publish new versions.

### Token Management

- **For Publishing**: No token needed! OIDC handles authentication automatically
- **For Private Dependencies**: If you need to install private npm packages during CI:
  ```yaml
  - run: pnpm install --frozen-lockfile
    env:
      NODE_AUTH_TOKEN: ${{ secrets.NPM_READ_TOKEN }}
  ```
  Use read-only tokens only

### Revoking Old Tokens

After confirming trusted publishing works:

1. Go to npmjs.com → **Access Tokens**
2. Revoke any automation tokens that were used for publishing
3. Keep only read-only tokens (if needed for private dependencies)

## Troubleshooting

### "Unable to authenticate" error

- ✅ Verify workflow filename in npmjs.com matches exactly: `publish.yml`
- ✅ Ensure all fields are case-sensitive and exact
- ✅ Confirm you're using GitHub-hosted runners (not self-hosted)
- ✅ Check that `id-token: write` permission is set in workflow

### Workflow not triggering

- Ensure tag format matches: `v*` (e.g., `v1.0.0`, `v2.1.3`)
- Verify tag was pushed: `git push --tags`

### Provenance not generated

- Provenance only works for public repos publishing public packages
- Ensure you're publishing via OIDC (no `NODE_AUTH_TOKEN`)

## Current Workflow Trigger

The publish workflow triggers on:

- Push events with tags matching `v*`
- Example: `v1.0.0`, `v1.2.3`, `v2.0.0-beta.1`

## Additional Resources

- [npm Trusted Publishing Documentation](https://docs.npmjs.com/generating-provenance-statements)
- [OpenSSF Trusted Publishers Specification](https://github.com/ossf/wg-securing-software-repos/blob/main/docs/publications/trusted-publishers.md)
- [GitHub Actions OIDC Documentation](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect)

## Need Help?

If you encounter issues:

1. Check the workflow runs in GitHub Actions
2. Review npm's security and signing logs
3. Open an issue in the repository

---

**Note**: Self-hosted runners are not currently supported for trusted publishing. Always use GitHub-hosted runners for the publish workflow.
