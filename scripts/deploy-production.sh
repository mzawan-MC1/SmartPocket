#!/usr/bin/env bash

set -Eeuo pipefail

APP_DIR="/var/www/smartpocket"
PM2_APP="smartpocket"
HEALTH_URL="http://127.0.0.1:4030/home"
BACKUP_DIR="$APP_DIR/.next_previous"

cd "$APP_DIR"

echo "Installing exact dependencies..."
npm ci

echo "Backing up the current Next.js build..."
rm -rf "$BACKUP_DIR"

if [ -d "$APP_DIR/.next" ]; then
  cp -a "$APP_DIR/.next" "$BACKUP_DIR"
fi

rollback() {
  echo "Deployment failed. Restoring the previous build..."

  rm -rf "$APP_DIR/.next"

  if [ -d "$BACKUP_DIR" ]; then
    mv "$BACKUP_DIR" "$APP_DIR/.next"
    pm2 restart "$PM2_APP" --update-env || true
    pm2 save || true
  fi

  pm2 logs "$PM2_APP" --lines 100 --nostream || true
}

trap rollback ERR

echo "Stopping the current application..."
pm2 stop "$PM2_APP" || true

echo "Removing the previous build..."
rm -rf "$APP_DIR/.next"

echo "Building Smart Pocket..."
npm run build

echo "Restarting Smart Pocket..."
pm2 restart "$PM2_APP" --update-env
pm2 save

echo "Waiting for the application health check..."

for attempt in {1..20}; do
  if curl --fail --silent --show-error "$HEALTH_URL" >/dev/null; then
    echo "Deployment completed successfully."
    rm -rf "$BACKUP_DIR"
    trap - ERR
    pm2 status
    exit 0
  fi

  echo "Health check attempt $attempt failed. Retrying..."
  sleep 3
done

echo "Application did not pass the health check."
false
