const fs = require('fs');
const path = require('path');

const IGNORED_DIRS = new Set(['node_modules', 'dist', 'framework', 'common']);

function findAllPieceFolders(folderPath) {
  if (!fs.existsSync(folderPath)) {
    throw new Error(
      `Piece discovery root not found: ${folderPath}. Pieces live under packages/integrations/core and packages/integrations/community.`,
    );
  }
  const results = [];
  for (const entry of fs.readdirSync(folderPath)) {
    if (IGNORED_DIRS.has(entry)) continue;
    const full = path.join(folderPath, entry);
    if (!fs.statSync(full).isDirectory()) continue;
    if (fs.existsSync(path.join(full, 'package.json'))) {
      results.push(full);
    } else {
      results.push(...findAllPieceFolders(full));
    }
  }
  return results;
}

function resolveDevPieceFilters({ apDevPieces, cwd = process.cwd() }) {
  if (!apDevPieces || !apDevPieces.trim()) return [];
  const pieceNames = [...new Set(apDevPieces.split(',').map((name) => name.trim()).filter(Boolean))];
  const root = path.resolve(cwd, 'packages', 'integrations');
  const allFolders = findAllPieceFolders(root);
  return pieceNames.map((name) => {
    const dir = allFolders.find((folder) => path.basename(folder) === name);
    if (!dir) {
      throw new Error(`❌ Piece folder not found for: "${name}". Searched ${root}.`);
    }
    const packageName = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf-8')).name;
    return `--filter=${packageName}`;
  });
}

module.exports = { devPieces: { findAllPieceFolders, resolveDevPieceFilters } };
