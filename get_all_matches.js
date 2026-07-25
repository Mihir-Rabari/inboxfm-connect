const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const EXACT_TERMS = [
  'EventDestinationEntity',
  'EventDestination',
  'platformWebhooks',
  'platform-webhooks',
  'platformWebhooksModule',
  'platformWebhooksController',
  'eventDestinationsModule',
  'FLOW_RUN_FINISHED',
  'FLOW_RUN_STARTED',
  'FLOW_RUN_FAILED',
  'RUN_FINISHED',
  'RUN_FAILED',
  'WEBHOOK_EVENT'
];

const IMPORT_TERMS = [
  'event-destinations',
  'platform-webhooks'
];

const files = execSync('git ls-files', { maxBuffer: 15 * 1024 * 1024, encoding: 'utf-8' })
  .split('\n')
  .map(f => f.trim())
  .filter(f => f && fs.existsSync(f) && fs.statSync(f).isFile());

console.log('Total files:', files.length);

const resultsSubstring = {};
const resultsWord = {};

EXACT_TERMS.forEach(t => {
  resultsSubstring[t] = [];
  resultsWord[t] = [];
});

files.forEach(file => {
  const content = fs.readFileSync(file, 'utf-8');
  if (file.includes('node_modules') || file.includes('dist/')) return;
  const lines = content.split(/\r?\n/);
  lines.forEach((line, idx) => {
    EXACT_TERMS.forEach(term => {
      if (line.includes(term)) {
        resultsSubstring[term].push({ file, lineNum: idx + 1 });
        const escaped = term.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp('\\b' + escaped + '\\b');
        if (regex.test(line)) {
          resultsWord[term].push({ file, lineNum: idx + 1 });
        }
      }
    });
  });
});

console.log('--- SUBSTRING COUNTS ---');
EXACT_TERMS.forEach(t => {
  console.log(`${t}: ${resultsSubstring[t].length}`);
});

console.log('--- WORD BOUNDARY COUNTS ---');
EXACT_TERMS.forEach(t => {
  console.log(`${t}: ${resultsWord[t].length}`);
});
