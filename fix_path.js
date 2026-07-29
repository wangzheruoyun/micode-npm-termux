const fs = require('fs');
const content = fs.readFileSync('/data/data/com.termux/files/home/micode/src/index.ts', 'utf8');

const oldCode = `const currentPath = process.env.PATH || "/data/data/com.termux/files/usr/bin";
  if (!currentPath.includes(cargoBin)) {
    process.env.PATH = \`${currentPath}:${cargoBin}\`;
  }`;

const newCode = `const currentPath = process.env.PATH || "/data/data/com.termux/files/usr/bin";
  // Ensure user paths are in PATH for tools like ast-grep and seek
  const userPaths = [
    \`${process.env.HOME}/.local/bin\`,
    \`${process.env.HOME}/.cargo/bin\`,
    "/usr/local/bin",
    "/opt/homebrew/bin"
  ].filter(p => !currentPath.includes(p));
  if (userPaths.length > 0) {
    process.env.PATH = \`${currentPath}:${userPaths.join(":")}\`;
  }`;

const newContent = content.replace(oldCode, newCode);
fs.writeFileSync('/data/data/com.termux/files/home/micode/src/index.ts', newContent);
console.log('Done');
