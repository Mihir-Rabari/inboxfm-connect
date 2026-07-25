const fs = require('fs');
const path = require('path');

const content = fs.readFileSync('audit_results_final.txt', 'utf-8');
const blocks = content.trim().split('================================================================================\n\n');

let startIndex = 0;
if (fs.existsSync('audit_progress.txt')) {
  startIndex = parseInt(fs.readFileSync('audit_progress.txt', 'utf-8').trim(), 10) || 0;
}

const chunkSize = 15;
const endIndex = Math.min(startIndex + chunkSize, blocks.length);

const selectedBlocks = blocks.slice(startIndex, endIndex);
selectedBlocks.forEach(b => {
  console.log(b + '\n================================================================================\n');
});

fs.writeFileSync('audit_progress.txt', String(endIndex), 'utf-8');
