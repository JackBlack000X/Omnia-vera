#!/bin/bash

# Setup rapido per Replit - Omnia Vera
# Avvia expo tunnel + auto-pull su una branch specifica
#
# Uso:
#   ./start-dev.sh                  # usa la branch corrente
#   ./start-dev.sh preview/feature  # guarda una branch specifica

BRANCH="${1:-$(git rev-parse --abbrev-ref HEAD)}"

echo "🚀 Omnia Vera - Dev Setup"
echo "📱 Branch: $BRANCH"
echo ""

# Checkout della branch richiesta
if [ "$(git rev-parse --abbrev-ref HEAD)" != "$BRANCH" ]; then
  echo "🔀 Switching to branch: $BRANCH"
  git fetch origin "$BRANCH"
  git checkout -B "$BRANCH" "origin/$BRANCH"
fi

# Avvia auto-pull in background
echo "👀 Avvio auto-pull in background..."
bash auto-pull.sh "$BRANCH" &
PULL_PID=$!

echo "✅ Auto-pull attivo (PID: $PULL_PID)"
echo ""
echo "📲 Avvio Expo con tunnel..."
echo "   Scansiona il QR con Expo Go quando appare"
echo ""

# Avvia expo tunnel
npx expo start --tunnel

# Quando expo si chiude, ferma anche auto-pull
kill $PULL_PID 2>/dev/null
