#!/bin/bash

# 🔁 Auto Pull Omnia Vera - by ChatGPT
# Controlla ogni 30 secondi se ci sono nuove modifiche su GitHub
# e aggiorna la copia locale automaticamente

cd /Users/giacomoboldrini/Omnia-vera

while true; do
  echo "🔍 Checking for updates... $(date)"
  git fetch origin main >/dev/null 2>&1
  LOCAL=$(git rev-parse @)
  REMOTE=$(git rev-parse @{u})

  if [ "$LOCAL" != "$REMOTE" ]; then
    echo "⬇️  New commits found, pulling changes..."
    git reset --hard origin/main
    echo "✅ Updated at $(date)"
  fi

  sleep 30
done

