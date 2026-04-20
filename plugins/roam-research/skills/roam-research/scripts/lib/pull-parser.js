'use strict';

const PULL_SELECTOR = '[:block/uid :block/string :block/order {:block/children ...}]';

function parsePullResult(node) {
  if (!node) return null;
  const uid = node[':block/uid'];
  if (!uid) return null;
  const string = node[':block/string'] || '';
  const order = node[':block/order'] ?? 0;
  const rawChildren = node[':block/children'] || [];
  const children = rawChildren
    .map(child => parsePullResult(child))
    .filter(Boolean)
    .sort((a, b) => a.order - b.order);
  return { uid, string, order, children };
}

function formatBlockTree(blocks, indent = 0) {
  let output = '';
  const prefix = '  '.repeat(indent) + '- ';
  for (const block of blocks) {
    output += prefix + block.string + '\n';
    if (block.children && block.children.length > 0) {
      output += formatBlockTree(block.children, indent + 1);
    }
  }
  return output;
}

module.exports = { PULL_SELECTOR, parsePullResult, formatBlockTree };
