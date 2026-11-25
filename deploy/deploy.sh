#!/usr/bin/env bash
# Deploy the latest code on the server: pull, install, build, restart.
#   sudo bash /opt/soundroot/deploy/deploy.sh            # deploy latest from the tracked branch
#   sudo bash /opt/soundroot/deploy/deploy.sh --no-pull  # rebuild the current checkout
#   sudo SEED_DEMO=1 bash /opt/soundroot/deploy/deploy.sh   # also load demo data into an EMPTY database (see DEPLOY.md warning)
set -euo pipefail

APP_DIR=/opt/soundroot
ENV_FILE=/etc/soundroot/soundroot.env
as_app() { sudo -H -u soundroot --preserve-env=SEED_DEMO bash -c "cd $APP_DIR && set -a && . $ENV_FILE && set +a && $*"; }

if [[ $EUID -ne 0 ]]; then echo "Run as root (sudo)." >&2; exit 1; fi
cd "$APP_DIR"

if [[ "${1:-}" != "--no-pull" ]]; then
  echo "==> Pulling latest code"
  as_app "git pull --ff-only"
fi

echo "==> Backing up data before deploy"
if [[ -f "$APP_DIR/data/soundroot.db" ]]; then as_app "node scripts/backup.ts"; fi

echo "==> Installing dependencies"
as_app "npm ci --no-audit --no-fund"

echo "==> Building"
as_app "NODE_ENV=production npm run build"

if [[ "${SEED_DEMO:-0}" == "1" ]]; then
  echo "==> Seeding demo data (only if the database is empty)"
  as_app "node --disable-warning=ExperimentalWarning scripts/seed.ts --if-empty"
fi

echo "==> Restarting"
systemctl restart soundroot
sleep 3
if systemctl is-active --quiet soundroot && curl -fsS -o /dev/null http://127.0.0.1:3000/; then
  echo "==> SoundzRoot is up."
else
  echo "!! SoundzRoot did not come up. Check: journalctl -u soundroot -n 100" >&2
  exit 1
fi
