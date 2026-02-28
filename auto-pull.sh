#!/bin/bash

# Auto Pull - branch watcher per Replit + Expo Go workflow
# Uso: ./auto-pull.sh [nome-branch]
# Default: controlla la branch corrente

BRANCH="${1:-$(git rev-parse --abbrev-ref HEAD)}"
DIR="$(cd "$(dirname "$0")" && pwd)"

cd "$DIR"

echo "👀 Watching branch: $BRANCH"
echo "📁 Directory: $DIR"
echo "⏱  Checking every 10 seconds... (Ctrl+C to stop)"
echo ""

git fetch origin "$BRANCH" >/dev/null 2>&1

while true; do
  git fetch origin "$BRANCH" >/dev/null 2>&1

  LOCAL=$(git rev-parse HEAD 2>/dev/null)
  REMOTE=$(git rev-parse "origin/$BRANCH" 2>/dev/null)

  if [ "$LOCAL" != "$REMOTE" ]; then
    echo "⬇️  Nuovi cambiamenti su '$BRANCH', aggiorno... ($(date +%H:%M:%S))"
    git reset --hard "origin/$BRANCH" >/dev/null 2>&1
    echo "✅ Aggiornato! Expo Go dovrebbe ricaricarsi automaticamente."
    echo ""
  fi

  sleep 10
done
