#!/bin/bash
set -e

# ═══════════════════════════════════════════════════════════
# Cementi – Deploy to server
# Usage: ./deploy.sh [user@host]
# ═══════════════════════════════════════════════════════════

SERVER="${1:?Usage: ./deploy.sh user@host}"
REMOTE_DIR="/opt/cementi"
LOCAL_DIR="$(cd "$(dirname "$0")" && pwd)"

echo ""
echo "  ╔═══════════════════════════════════════╗"
echo "  ║       Cementi – Deploy to Server      ║"
echo "  ╚═══════════════════════════════════════╝"
echo ""
echo "  Server: $SERVER"
echo "  Remote: $REMOTE_DIR"
echo ""

ssh "$SERVER" "sudo mkdir -p $REMOTE_DIR && sudo chown \$(whoami):\$(whoami) $REMOTE_DIR"

echo "→ Syncing code..."
rsync -avz \
    --exclude 'node_modules' \
    --exclude 'data/*.db*' \
    --exclude '.git' \
    --exclude 'public/foto' \
    --exclude 'public/thumbs' \
    --exclude 'public/display' \
    "$LOCAL_DIR/" "$SERVER:$REMOTE_DIR/" 2>&1 | tail -3

echo ""
echo "→ Syncing photos (skipping unchanged)..."
rsync -avz --size-only \
    "$LOCAL_DIR/public/foto/" "$SERVER:$REMOTE_DIR/public/foto/" 2>&1 | tail -3

echo ""
echo "→ Syncing thumbnails..."
rsync -avz --size-only \
    "$LOCAL_DIR/public/thumbs/" "$SERVER:$REMOTE_DIR/public/thumbs/" 2>&1 | tail -3

echo ""
echo "→ Syncing display copies..."
rsync -avz --size-only \
    "$LOCAL_DIR/public/display/" "$SERVER:$REMOTE_DIR/public/display/" 2>&1 | tail -3

echo ""
echo "→ Setting up server..."
ssh "$SERVER" << REMOTE
set -e

if ! command -v node &>/dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi
echo "  Node: \$(node --version)"

if ! command -v pm2 &>/dev/null; then
    sudo npm install -g pm2
fi

# Deps
cd $REMOTE_DIR && npm install --production 2>&1 | tail -1

# Database (create if missing, safe to re-run)
mkdir -p $REMOTE_DIR/data
node -e "
    var Database = require('$REMOTE_DIR/node_modules/better-sqlite3');
    var bcrypt = require('$REMOTE_DIR/node_modules/bcryptjs');
    var db = new Database('$REMOTE_DIR/data/cementi.db');
    db.pragma('journal_mode = WAL');
    db.exec('CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL, display_name TEXT NOT NULL, password_hash TEXT NOT NULL, is_admin INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP); CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY AUTOINCREMENT, page_id TEXT NOT NULL, user_id INTEGER NOT NULL, content TEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (user_id) REFERENCES users(id)); CREATE INDEX IF NOT EXISTS idx_comments_page ON comments(page_id); CREATE TABLE IF NOT EXISTS albums (id TEXT PRIMARY KEY, title TEXT NOT NULL, subtitle TEXT DEFAULT \"\", description TEXT DEFAULT \"\", cover_photo TEXT DEFAULT \"\", sort_order INTEGER DEFAULT 0);');
    db.prepare('INSERT OR IGNORE INTO users (username, display_name, password_hash, is_admin) VALUES (?, ?, ?, 1)').run('admin', 'Administrátor', bcrypt.hashSync('admin', 10));
    db.prepare('INSERT OR IGNORE INTO users (username, display_name, password_hash, is_admin) VALUES (?, ?, ?, 0)').run('test', 'Test', bcrypt.hashSync('test123', 10));
    console.log('  DB ready');
"

# Restart PM2 service (source .env for SESSION_SECRET if present)
pm2 delete cementi 2>/dev/null || true
if [ -f $REMOTE_DIR/.env ]; then set -a; source $REMOTE_DIR/.env; set +a; fi
PORT=3000 pm2 start $REMOTE_DIR/server.js --name cementi --update-env
pm2 save
echo ""
pm2 list
REMOTE

echo ""
echo "  Deploy complete."
echo ""
