# Aurora Demo Backend — Deployment Guide (x86_64)

This image is for **testing/demo only**. It contains the Aurora demo backend
with a **Donyx iRM** data/schema snapshot and the **Donyx-branded Aurora Vue 2**
frontend (dark theme, `Donyx - Control Panel`).
Halo/donyx client code is **not** included.

## Package contents

| File | Purpose |
| --- | --- |
| `aurora-demo-backend-2026-11-24-donyx-amd64.tar` | Docker image archive, `linux/amd64` |
| `aurora-demo-backend-2026-11-24-donyx-amd64.tar.sha256` | SHA-256 checksum |
| `docker-compose.deploy.yml` | Optional Compose file for the same image |

Image name/tag after loading:

```text
aurora-demo-backend:2026-11-24-donyx-amd64
```

## 1. Copy files to the server

Copy all three files to the server, for example:

```sh
scp aurora-demo-backend-2026-11-24-donyx-amd64.tar* \
    docker-compose.deploy.yml \
    user@server:/opt/aurora-demo/
```

## 2. Verify the archive

On the server, from the directory with the files:

```sh
sha256sum -c aurora-demo-backend-2026-11-24-donyx-amd64.tar.sha256
```

Expected output:

```text
aurora-demo-backend-2026-11-24-donyx-amd64.tar: OK
```

If the checksum does not match, do not deploy; copy the archive again.

## 3. Load the image

```sh
docker load -i aurora-demo-backend-2026-11-24-donyx-amd64.tar
```

Check architecture (must be `amd64`):

```sh
docker image inspect aurora-demo-backend:2026-11-24-donyx-amd64 \
  --format '{{.Architecture}} {{.Os}}'
```

Expected:

```text
amd64 linux
```

## 4. Start the container

Remove an old container with the same name if it exists:

```sh
docker rm -f aurora-demo 2>/dev/null || true
```

Start:

```sh
docker run -d \
  --name aurora-demo \
  --hostname aurora-demo \
  --restart unless-stopped \
  -p 8080:8080 \
  -e PORT=8080 \
  -e FRONTEND_DIST=/app/frontend/aurora \
  -e DEMO_SESSION_TTL=3600 \
  -e DEMO_MAX_SESSIONS=200 \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,nodev \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  --memory 256m \
  --pids-limit 100 \
  aurora-demo-backend:2026-11-24-donyx-amd64
```

Check that it is running:

```sh
docker ps --filter name=aurora-demo
```

## 5. Open in a browser

Open:

```text
http://SERVER_IP:8080/
```

Login:

- **Username:** any non-empty name (`demo` is fine)
- **Password:** any password (`demo` is fine)

Every browser/session gets its own in-memory copy of the demo data.

## 6. Verify from the command line

```sh
curl http://127.0.0.1:8080/healthz
```

Expected:

```json
{"ok":true,"sessions":0}
```

Check the frontend:

```sh
curl -s http://127.0.0.1:8080/ | grep -o '<title>[^<]*</title>'
```

Expected:

```text
<title>iRZ Control</title>
```

Check authentication:

```sh
curl -s -X POST http://127.0.0.1:8080/script/auth \
  -H 'Content-Type: application/json' \
  -d '{"username":"demo","password":"demo"}'
```

Expected: JSON with `token` and `timeout`.

## Optional: start with Compose

If `docker-compose.deploy.yml` is in the same directory:

```sh
docker compose -f docker-compose.deploy.yml up -d
```

It uses the same image and settings as the manual `docker run` above.

## Operations

Show logs:

```sh
docker logs -f aurora-demo
```

Restart:

```sh
docker restart aurora-demo
```

Stop and remove:

```sh
docker stop aurora-demo
docker rm aurora-demo
```

Upgrade:

```sh
docker rm -f aurora-demo
docker load -i aurora-demo-backend-<NEW-VERSION>-amd64.tar
# run the docker run command again with the new tag
```

Data is stored in memory and is lost when the container is removed or restarted.

## Troubleshooting

### `exec format error`

The image architecture does not match the server.

Check:

```sh
uname -m
docker image inspect aurora-demo-backend:2026-11-24-donyx-amd64 \
  --format '{{.Architecture}}'
```

This package is for `x86_64` / `amd64`. Do not use the arm64 build on an x86
server.

### Port 8080 is already in use

Use another host port, for example:

```sh
-p 8090:8080
```

The container always listens on `8080` internally.

### Container exits or is unhealthy

```sh
docker ps -a --filter name=aurora-demo
docker logs aurora-demo
```

If you use `--read-only`, keep the `--tmpfs /tmp` flag.

### Page is blank or shows the fallback page

Check `/healthz` and:

```sh
docker exec aurora-demo ls -la /app/frontend/aurora
```

The image must contain `index.html`, `js/`, and `css/` in
`/app/frontend/aurora`.

### Cannot connect from another machine

Open TCP `8080` in the server firewall/hosting security group. Test locally
first with `curl http://127.0.0.1:8080/healthz`.

## Security

This is a demo service:

- no TLS;
- no rate limiting;
- any non-empty username/password is accepted;
- no real device commands are executed.

Do not expose it to the public internet without an HTTPS reverse proxy
(nginx/Caddy) and access restrictions.
