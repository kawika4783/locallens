# LocalLens

A focused local web app for preparing YouTube videos you own or have permission to save for offline viewing.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173`. The Vite frontend proxies API requests to the local Node server on port `8787`.

For a production-style run:

```bash
npm run build
npm start
```

Then open `http://localhost:8787`.

LocalLens uses `yt-dlp` and `ffmpeg` through bundled npm dependencies. Temporary downloads are deleted after they are sent to the browser. Download only videos you own or have permission to save, and follow the platform's terms and applicable law.

## Docker

Build and run from a cloned repository:

```bash
docker compose up -d --build
```

Open `http://YOUR_VPS_IP:8787`. To expose another host port:

```bash
LOCALLENS_PORT=8080 docker compose up -d --build
```

Temporary media files live in an in-memory container filesystem and are removed after each response. The default limit is 4 GB. Override it for larger downloads:

```bash
LOCALLENS_DOWNLOAD_TMPFS_SIZE=8g docker compose up -d --build
```

Check the container:

```bash
docker compose ps
docker compose logs -f locallens
```

### Hostinger VPS Docker Manager

For the Hostinger server at `srv1831469.hstgr.cloud`, use the dedicated `compose.hostinger.yaml` file. It follows the same deployment pattern as the working services on that VPS: a hardcoded public image, Docker-internal port exposure, and Traefik labels for automatic HTTPS routing at `https://locallens.srv1831469.hstgr.cloud`.

## Publish to GitHub Container Registry

The workflow at `.github/workflows/docker-publish.yml` publishes Linux AMD64 and ARM64 images to:

```text
ghcr.io/YOUR_GITHUB_USERNAME/YOUR_REPOSITORY:latest
```

Push the repository's `main` branch to GitHub. In the repository's **Packages** settings, make the package public if the VPS should pull without signing in.

### Compose directly from the GitHub-hosted file

Set your image name and pipe the raw Compose file to Docker:

```bash
export LOCALLENS_IMAGE=ghcr.io/YOUR_GITHUB_USERNAME/YOUR_REPOSITORY:latest
curl -fsSL https://raw.githubusercontent.com/YOUR_GITHUB_USERNAME/YOUR_REPOSITORY/main/compose.ghcr.yaml \
  | docker compose -f - up -d
```

For Portainer, create a Git repository stack, point it at your repository, select `compose.ghcr.yaml`, and add this environment variable:

```text
LOCALLENS_IMAGE=ghcr.io/YOUR_GITHUB_USERNAME/YOUR_REPOSITORY:latest
```

When the image is private, first authenticate on the VPS with a GitHub personal access token that has `read:packages` permission:

```bash
echo "$GHCR_TOKEN" | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
```

## Persistent YouTube bot checks on a VPS

LocalLens automatically retries transient YouTube bot challenges with multiple player clients. Some datacenter/VPS IP addresses may still be persistently challenged. In that case, the server can use an owner-supplied Netscape-format cookies file through `YOUTUBE_COOKIES_FILE`.

The easiest option for a Portainer or URL-based Compose stack is to export only your `youtube.com` cookies in Netscape format, Base64-encode the file, and set the resulting value as the stack environment variable `YOUTUBE_COOKIES_BASE64`.

Linux:

```bash
base64 -w 0 youtube-cookies.txt
```

PowerShell:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("youtube-cookies.txt"))
```

Then recreate the container. LocalLens decodes the value into its private `/tmp` filesystem at startup; the cookies are not added to the image or repository. Environment variables can still be inspected by Docker administrators, so use a dedicated/throwaway YouTube account and restrict access to the VPS. YouTube may temporarily or permanently restrict accounts used by download tools.

If you operate a permitted outbound proxy, set `YOUTUBE_PROXY` to its URL (for example `http://user:password@proxy-host:3128`). A residential/home IP is generally less likely to receive the datacenter-IP challenge.

For Docker secrets or a direct file mount, `YOUTUBE_COOKIES_FILE` remains supported:

Do not expose the cookies file through the web app or commit it to Git. Mount it read-only into the container and set the environment variable to its container path, for example:

```yaml
services:
  locallens:
    environment:
      YOUTUBE_COOKIES_FILE: /run/secrets/youtube-cookies.txt
    volumes:
      - ./youtube-cookies.txt:/run/secrets/youtube-cookies.txt:ro
```
