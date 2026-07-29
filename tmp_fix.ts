  // Add cargo bin to PATH for tools like ast-grep
  const homeDir = process.env.HOME || process.env.USERPROFILE || "/data/data/com.termux/files/home";
  const cargoBin = `${homeDir}/.cargo/bin`;
  const currentPath = process.env.PATH || "/data/data/com.termux/files/usr/bin";
  // Ensure user paths are in PATH for tools like ast-grep and seek
  const userPaths = [`${homeDir}/.local/bin`, `${homeDir}/.cargo/bin`, "/usr/local/bin", "/opt/homebrew/bin"];
  for (const p of userPaths) {
    if (!currentPath.includes(p)) {
      currentPath += ":" + p;
    }
  }
  process.env.PATH = currentPath;

  // Validate external tool dependencies at startup
