const fs = require('fs');
const content = fs.readFileSync('/data/data/com.termux/files/home/micode/src/index.ts', 'utf8');

const oldCode = "  const cargoBin = `${process.env.HOME}/.cargo/bin`;\n  if (!process.env.PATH?.includes(cargoBin)) {\n    process.env.PATH = `${process.env.PATH}:${cargoBin}`;\n  }";

const newCode = "  const homeDir = process.env.HOME || process.env.USERPROFILE || \"/data/data/com.termux/files/home\";\n  const cargoBin = `${homeDir}/.cargo/bin`;\n  const currentPath = process.env.PATH || \"/data/data/com.termux/files/usr/bin\";\n  // Ensure user paths are in PATH for tools like ast-grep and seek\n  const userPaths = [\n    `${homeDir}/.local/bin`,\n    `${homeDir}/.cargo/bin`,\n    \"/usr/local/bin\",\n    \"/opt/homebrew/bin\"\n  ].filter(p => !currentPath.includes(p));\n  if (userPaths.length > 0) {\n    process.env.PATH = `${currentPath}:${userPaths.join(\":\")}`;\n  }";

const newContent = content.replace(oldCode, newCode);
fs.writeFileSync('/data/data/com.termux/files/home/micode/src/index.ts', newContent);
console.log('Done');
