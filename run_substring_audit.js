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

const results = {};
EXACT_TERMS.forEach(t => { results[t] = []; });
IMPORT_TERMS.forEach(t => { results['import-' + t] = []; });

files.forEach(file => {
  const content = fs.readFileSync(file, 'utf-8');
  if (file.includes('node_modules') || file.includes('dist/')) return;
  const lines = content.split(/\r?\n/);
  const ext = path.extname(file).toLowerCase();
  const isCodeFile = ['.ts', '.js', '.tsx', '.jsx'].includes(ext);

  lines.forEach((line, idx) => {
    EXACT_TERMS.forEach(term => {
      if (line.includes(term)) {
        results[term].push({ file, lineNum: idx + 1, lineContent: line, lines });
      }
    });

    IMPORT_TERMS.forEach(term => {
      if (isCodeFile && line.includes(term) && (line.includes('import') || line.includes('require'))) {
        results['import-' + term].push({ file, lineNum: idx + 1, lineContent: line, lines });
      }
    });
  });
});

let output = '';

function getClassification(file, lineContent) {
  const lowerFile = file.toLowerCase();
  if (lowerFile.endsWith('.md') || lowerFile.endsWith('.mdx') || lowerFile.includes('readme') || lowerFile.includes('license') || lowerFile.startsWith('docs/')) {
    return 'Documentation';
  }
  if (lowerFile.includes('/test/') || lowerFile.includes('__tests__') || lowerFile.includes('.test.') || lowerFile.includes('.spec.') || lowerFile.includes('smoke-test/')) {
    return 'Test';
  }
  if (lowerFile.includes('dead_code') || lowerFile.includes('dead-code')) {
    return 'Documentation';
  }
  
  // Check if it is a dead file or active file
  // Wait, let's assume active unless it's in DEAD_CODE or is not used.
  // Actually, we checked app/ee/platform-webhooks and it is imported and registered in app.ts, so it is Active.
  // What about event-destinations? It is registered in database-connection.ts and setup in platform-webhooks.module.ts, so it is Active.
  // What about execution/src/lib/workers/job-data.ts? It is imported/used, so it is Active.
  // So all non-test/non-doc matches in the repo are Active.
  return 'Active';
}

EXACT_TERMS.forEach(term => {
  const matches = results[term];
  if (matches.length === 0) {
    output += `Search Term: ${term}\nNo matches found.\n\n`;
    return;
  }

  matches.forEach(m => {
    const classification = getClassification(m.file, m.lineContent);
    const startIdx = Math.max(0, m.lineNum - 1 - 5);
    const endIdx = Math.min(m.lines.length - 1, m.lineNum - 1 + 5);

    const beforeLines = [];
    for (let i = startIdx; i < m.lineNum - 1; i++) {
      beforeLines.push(m.lines[i]);
    }
    while (beforeLines.length < (m.lineNum - 1 - startIdx)) {
      beforeLines.unshift('');
    }

    const afterLines = [];
    for (let i = m.lineNum; i <= endIdx; i++) {
      afterLines.push(m.lines[i]);
    }

    output += `================================================================================\n`;
    output += `Search Term: ${term}\n`;
    output += `Classification: ${classification}\n`;
    output += `File: ${m.file}\n`;
    output += `Line: ${m.lineNum}\n`;
    output += `--------------------------------------------------------------------------------\n`;
    output += beforeLines.join('\n') + '\n\n';
    output += m.lineContent + '\n\n';
    output += afterLines.join('\n') + '\n';
    output += `================================================================================\n\n`;
  });
});

IMPORT_TERMS.forEach(term => {
  const matches = results['import-' + term];
  const displayTerm = 'import statements containing: ' + term;
  if (matches.length === 0) {
    output += `Search Term: ${displayTerm}\nNo matches found.\n\n`;
    return;
  }

  matches.forEach(m => {
    const classification = getClassification(m.file, m.lineContent);
    const startIdx = Math.max(0, m.lineNum - 1 - 5);
    const endIdx = Math.min(m.lines.length - 1, m.lineNum - 1 + 5);

    const beforeLines = [];
    for (let i = startIdx; i < m.lineNum - 1; i++) {
      beforeLines.push(m.lines[i]);
    }
    while (beforeLines.length < (m.lineNum - 1 - startIdx)) {
      beforeLines.unshift('');
    }

    const afterLines = [];
    for (let i = m.lineNum; i <= endIdx; i++) {
      afterLines.push(m.lines[i]);
    }

    output += `================================================================================\n`;
    output += `Search Term: ${displayTerm}\n`;
    output += `Classification: ${classification}\n`;
    output += `File: ${m.file}\n`;
    output += `Line: ${m.lineNum}\n`;
    output += `--------------------------------------------------------------------------------\n`;
    output += beforeLines.join('\n') + '\n\n';
    output += m.lineContent + '\n\n';
    output += afterLines.join('\n') + '\n';
    output += `================================================================================\n\n`;
  });
});

fs.writeFileSync('audit_results_final.txt', output, 'utf-8');
console.log('Final audit complete. Size:', output.length);
