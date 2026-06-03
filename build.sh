#!/bin/bash
# ============================================================
# Swara Aqua — Production Build Script for Hostinger
# Run from: ~/swara_aqua/
# ============================================================
set -e

echo "📦 Installing backend dependencies..."
cd backend
npm install

echo "🔨 Building backend TypeScript..."
./node_modules/.bin/tsc
echo "✅ Backend built → dist/"
cd ..

echo "📦 Installing frontend dependencies..."
cd frontend
npm install

echo "🔨 Building frontend..."
# Vite embeds VITE_* at build time (required for FCM / background push).
# These vars must be set in your environment or a frontend/.env file before running this script.
# Copy frontend/.env.example to frontend/.env and fill in your real values.
if [ ! -f "frontend/.env" ]; then
  echo "⚠️  WARNING: frontend/.env not found. Copying from .env.example..."
  cp frontend/.env.example frontend/.env
  echo "   Edit frontend/.env with your real Firebase config before building."
fi
./node_modules/.bin/vite build

echo "📁 Copying frontend dist → backend/public..."
rm -rf ../backend/public
cp -r dist ../backend/public
cd ..

# ── Place .htaccess in the correct public_html ────────────────────────────────
# Hostinger stores domains at ~/domains/DOMAIN/public_html
DOMAIN_DIR=$(find ~/domains -maxdepth 1 -mindepth 1 -type d 2>/dev/null | head -1)
if [ -n "$DOMAIN_DIR" ]; then
  # Hostinger Git deployment puts app in nodejs/ subfolder
  APPDIR="$DOMAIN_DIR/nodejs"
else
  APPDIR=~/nodejs
fi

echo "📁 Creating .env in $APPDIR/backend/"
mkdir -p "$APPDIR/backend"

USERNAME=$(whoami)

# Only create .env if it doesn't exist (don't overwrite secrets)
if [ ! -f "$APPDIR/backend/.env" ]; then
cat > "$APPDIR/backend/.env" << EOF
NODE_ENV=production
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_USER=${USERNAME}_swara_aqua
DB_PASSWORD=CHANGE_ME_DB_PASSWORD
DB_NAME=${USERNAME}_swara_aqua
DB_SSL=false
JWT_SECRET=CHANGE_ME_RANDOM_STRING_MIN_32_CHARS
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=CHANGE_ME_ANOTHER_RANDOM_STRING
JWT_REFRESH_EXPIRES_IN=7d
FRONTEND_URL=https://swaraaqua.labxco.in,https://wheat-woodpecker-720684.hostingersite.com
# Firebase: use JSON file (upload backend/config/firebase-service-account.json via File Manager)
FIREBASE_SERVICE_ACCOUNT_PATH=config/firebase-service-account.json
RAZORPAY_KEY_ID=rzp_test_SxC45uO6pN1sID
RAZORPAY_KEY_SECRET=aVd4Um78bK3Y3q4BKCLABkm9
EOF
  echo "✅ .env created — IMPORTANT: edit $APPDIR/backend/.env and replace all CHANGE_ME_ values with real secrets"
else
  echo "✅ .env already exists, skipping"
fi

echo ""
echo "✅ Build complete!"
echo ""
echo "Now in hPanel → Node.js:"
echo "  Application root:    ~/swara_aqua/backend"
echo "  Startup file:        app.js"
echo "  Node.js version:     18 (or 20)"
echo "  → Click Restart"
