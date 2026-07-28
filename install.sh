#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail

# micode offline installer for Termux
# This script installs micode plugin and all required binaries without network access

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MICODE_DIR="/data/data/com.termux/files/home/micode"
PLUGIN_DIR="$HOME/.config/opencode/plugins/micode"
OPENCODE_CONFIG="$HOME/.config/opencode/opencode.json"

echo "=== Installing micode plugin (offline) ==="

# 1. Create plugin directory
echo "Creating plugin directory: $PLUGIN_DIR"
mkdir -p "$PLUGIN_DIR"

# 2. Copy dist files
echo "Copying plugin files..."
cp -r "$SCRIPT_DIR/dist"/* "$PLUGIN_DIR/"

# 3. Install zigpty binary for ARM64 (Termux/Android)
echo "Installing zigpty binary..."
mkdir -p "$PLUGIN_DIR/tools/pty/prebuilds"
cp -f "$SCRIPT_DIR/node_modules/zigpty/prebuilds/zigpty.linux-arm64.node" "$PLUGIN_DIR/tools/pty/prebuilds/zigpty.linux-arm64.node"
cp -f "$SCRIPT_DIR/node_modules/zigpty/prebuilds/zigpty.linux-arm64-musl.node" "$PLUGIN_DIR/tools/pty/prebuilds/zigpty.linux-arm64-musl.node"
chmod +x "$PLUGIN_DIR/tools/pty/prebuilds/"*.node

# 3b. Install ast-grep binary (pre-built for arm64)
echo "Installing ast-grep binary..."
mkdir -p "$HOME/.local/bin"
if [ -f "$SCRIPT_DIR/prebuilt/ast-grep" ]; then
    cp -f "$SCRIPT_DIR/prebuilt/ast-grep" "$HOME/.local/bin/ast-grep"
    chmod +x "$HOME/.local/bin/ast-grep"
    echo "Installed ast-grep binary"
else
    echo "Warning: ast-grep binary not found in prebuilt/"
fi

# 3b. Install seek binary
if [ -f "$SCRIPT_DIR/prebuilt/seek" ]; then
    cp -f "$SCRIPT_DIR/prebuilt/seek" "$HOME/.local/bin/seek"
    chmod +x "$HOME/.local/bin/seek"
    echo "Installed seek binary"
else
    echo "Warning: seek binary not found in prebuilt/"
fi

# 3b. Add cargo bin to PATH in bashrc if not already
if ! grep -q '\.cargo/bin' "$HOME/.bashrc" 2>/dev/null; then
    echo 'export PATH="$PATH:$HOME/.cargo/bin"' >> "$HOME/.bashrc"
    echo "Added cargo bin to PATH in ~/.bashrc"
fi

# 3c. Add local bin to PATH in bashrc if not already
if ! grep -q '\.local/bin' "$HOME/.bashrc" 2>/dev/null; then
    echo 'export PATH="$PATH:$HOME/.local/bin"' >> "$HOME/.bashrc"
    echo "Added local bin to PATH in ~/.bashrc"
fi

# 5. Create/Update opencode config
echo "Setting up opencode config..."
mkdir -p "$(dirname "$OPENCODE_CONFIG")"
cat > "$OPENCODE_CONFIG" << 'EOF'
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["/data/data/com.termux/files/home/micode"]
}
EOF
echo "Created $OPENCODE_CONFIG"

# 5b. Create micode.json if not exists
MICODE_JSON="$HOME/.config/opencode/micode.json"
if [ ! -f "$MICODE_JSON" ]; then
    cat > "$MICODE_JSON" << 'EOF'
{
  "agents": {
    "brainstormer": { "model": "openai/gpt-4o", "temperature": 0.8 },
    "commander": {
      "maxTokens": 8192,
      "thinking": { "type": "enabled", "budgetTokens": 100000 }
    }
  },
  "features": {
    "mindmodelInjection": true
  },
  "compactionThreshold": 0.5,
  "fragments": {
    "commander": ["custom-instructions.md"]
  }
}
EOF
    echo "Created $MICODE_JSON"
fi

# 6. Source bashrc to pick up new PATH
export PATH="$PATH:$HOME/.cargo/bin:$HOME/.local/bin"

echo ""
echo "=== Installation complete! ==="
echo ""
echo "Next steps:"
echo "1. Restart your shell or run: source ~/.bashrc"
echo "2. Run 'opencode' to start"
echo ""
echo "The following binaries are now available:"
command -v ast-grep >/dev/null && echo "  - ast-grep: $(ast-grep --version)" || echo "  - ast-grep: NOT FOUND (run: cargo install ast-grep --locked)"
command -v seek >/dev/null && echo "  - seek: $(seek --version)" || echo "  - seek: NOT FOUND"
command -v zigpty >/dev/null && echo "  - zigpty: installed" || echo "  - zigpty: NOT FOUND"