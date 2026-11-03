import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const tracked = execFileSync('git', ['ls-files', '--cached', '--stage', '-z']);
const entries = tracked.toString('utf8').split('\0').filter(Boolean);
const allowed = /^(?:docs\.json|README\.md|\.github\/workflows\/validate\.yml|\.github\/scripts\/check-public-tree\.mjs|(?:en|fr)\/[a-z0-9/_-]+\.mdx|images\/[a-z0-9/_-]+\.png)$/;
const forbiddenPath = /(?:^|\/)(?:private|internal|drafts?|secrets?|credentials?)(?:\/|$)/i;
const forbiddenText = /(?:@mqoresearch\.com|@gmail\.com|uat\.app\.asker\.ca|localhost|BEGIN [A-Z ]*PRIVATE KEY|ghp_[A-Za-z0-9]{20,})/i;
const pages = new Set();

for (const entry of entries) {
  const match = /^([0-7]{6}) [0-9a-f]{40} 0\t(.+)$/.exec(entry);
  if (!match) throw new Error(`Unexpected Git index entry: ${entry}`);
  const [, mode, path] = match;
  if (mode !== '100644' || !allowed.test(path) || forbiddenPath.test(path)) {
    throw new Error(`Unapproved public file: ${path}`);
  }
  const bytes = readFileSync(path);
  if (path.endsWith('.png')) {
    if (!bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) {
      throw new Error(`Invalid PNG: ${path}`);
    }
  } else {
    const content = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (path.endsWith('.mdx') && forbiddenText.test(content)) throw new Error(`Private text in ${path}`);
    if (path.endsWith('.mdx')) pages.add(path.slice(0, -4));
  }
}

const config = JSON.parse(readFileSync('docs.json', 'utf8'));
const listed = [];
function collect(value) {
  if (typeof value === 'string') listed.push(value);
  else if (Array.isArray(value)) value.forEach(collect);
  else if (value && typeof value === 'object') Object.values(value).forEach(collect);
}
collect(config.navigation);
for (const page of pages) {
  if (!listed.includes(page)) throw new Error(`Page absent from navigation: ${page}`);
}
for (const page of listed.filter(value => /^(?:en|fr)\//.test(value))) {
  if (!pages.has(page)) throw new Error(`Navigation target absent: ${page}`);
}
console.log(`Checked ${entries.length} public files and ${pages.size} pages.`);
