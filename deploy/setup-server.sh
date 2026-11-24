#!/usr/bin/env bash
# One-time provisioning for a fresh Ubuntu 24.04 VPS.
# Run as root (or with sudo) ON THE SERVER:
#
#   curl -fsSL https://raw.githubusercontent.com/samansong/soundroot/main/deploy/setup-server.sh -o setup-server.sh
#   sudo DOMAIN=app.example.com bash setup-server.sh
#
# It installs Node 24, Caddy (automatic HTTPS) and a firewall, creates a `soundroot` system user,
# clones the repo to /opt/soundroot, writes /etc/soundroot/soundroot.env with fresh secrets,
# builds the app and starts it as a systemd service with daily backups.
set -euo pipefail

DOMAIN="${DOMAIN:?Set DOMAIN, e.g. DOMAIN=app.example.com}"
REPO="${REPO:-https://github.com/samansong/soundroot.git}"
BRANCH="${BRANCH:-main}"
APP_DIR=/opt/soundroot
ENV_FILE=/etc/soundroot/soundroot.env

if [[ $EUID -ne 0 ]]; then echo "Run as root (sudo)." >&2; exit 1; fi
echo "==> Provisioning SoundRoot for https://${DOMAIN}"

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl gnupg git ufw debian-keyring debian-archive-keyring apt-transport-https

# --- Node.js 24 (NodeSource)
if ! command -v node >/dev/null || [[ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
fi
echo "    node $(node -v)"

# --- Caddy (official repository)
if ! command -v caddy >/dev/null; then
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi

# --- Firewall: SSH + HTTP/HTTPS only (the app itself listens on 127.0.0.1)
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# --- App user and code
id soundroot >/dev/null 2>&1 || useradd --system --create-home --home-dir /var/lib/soundroot --shell /usr/sbin/nologin soundroot
if [[ ! -d "$APP_DIR/.git" ]]; then
  git clone --branch "$BRANCH" "$REPO" "$APP_DIR"
fi
chown -R soundroot:soundroot "$APP_DIR"

# --- Secrets (generated once, never committed)
mkdir -p /etc/soundroot
if [[ ! -f "$ENV_FILE" ]]; then
  sed -e "s|__DOMAIN__|${DOMAIN}|" \
      -e "s|__URL_SIGNING_SECRET__|$(openssl rand -hex 32)|" \
      -e "s|__PAYMENT_WEBHOOK_SECRET__|$(openssl rand -hex 32)|" \
      "$APP_DIR/deploy/soundroot.env.example" > "$ENV_FILE"
  echo "    wrote $ENV_FILE with fresh secrets"
fi
chown root:soundroot "$ENV_FILE"
chmod 640 "$ENV_FILE"

# --- Caddy site
sed "s|__DOMAIN__|${DOMAIN}|" "$APP_DIR/deploy/Caddyfile" > /etc/caddy/Caddyfile
systemctl reload caddy || systemctl restart caddy

# --- systemd units (app + daily backup)
install -m 644 "$APP_DIR/deploy/soundroot.service" /etc/systemd/system/soundroot.service
install -m 644 "$APP_DIR/deploy/soundroot-backup.service" /etc/systemd/system/soundroot-backup.service
install -m 644 "$APP_DIR/deploy/soundroot-backup.timer" /etc/systemd/system/soundroot-backup.timer
mkdir -p /var/backups/soundroot && chown soundroot:soundroot /var/backups/soundroot
systemctl daemon-reload
systemctl enable soundroot soundroot-backup.timer

# --- Build and start
bash "$APP_DIR/deploy/deploy.sh" --no-pull
systemctl start soundroot-backup.timer

cat <<EOF

==> Done. SoundRoot should be live at https://${DOMAIN} once DNS points here.

Next steps:
  1. Bluehost DNS: add an A record for ${DOMAIN} -> $(curl -fsS https://api.ipify.org || echo "<this server's IP>")
  2. Create your admin account:
       sudo -u soundroot bash -c 'cd $APP_DIR && set -a && . $ENV_FILE && set +a && node scripts/create-admin.ts --email you@example.com --name "Your Name"'
  3. Logs:     journalctl -u soundroot -f
     Updates:  sudo bash $APP_DIR/deploy/deploy.sh
EOF
