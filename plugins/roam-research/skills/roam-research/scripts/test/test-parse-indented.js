'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// Extracted from write-content.js for testability
const crypto = require('crypto');

function generateUid() {
  return crypto.randomBytes(6).toString('base64url').slice(0, 9);
}

function parseIndentedLines(lines) {
  const root = { text: null, depth: -1, children: [], uid: null };
  const stack = [root];

  for (const line of lines) {
    if (!line.trim()) continue;
    const spaces = line.length - line.trimStart().length;
    const depth = Math.floor(spaces / 2);
    const raw = line.trimStart();
    const text = raw.startsWith('- ') ? raw.slice(2) : raw;
    const node = { text, depth, children: [], uid: generateUid() };

    while (stack.length > 1 && stack[stack.length - 1].depth >= depth) {
      stack.pop();
    }
    stack[stack.length - 1].children.push(node);
    stack.push(node);
  }

  return root.children;
}

describe('parseIndentedLines', () => {
  it('returns empty array for empty input', () => {
    assert.deepEqual(parseIndentedLines([]).length, 0);
  });

  it('parses flat lines as siblings', () => {
    const result = parseIndentedLines(['Line A', 'Line B', 'Line C']);
    assert.equal(result.length, 3);
    assert.equal(result[0].text, 'Line A');
    assert.equal(result[1].text, 'Line B');
    assert.equal(result[2].text, 'Line C');
    assert.equal(result[0].children.length, 0);
  });

  it('parses nested lines as children', () => {
    const result = parseIndentedLines(['Parent', '  Child']);
    assert.equal(result.length, 1);
    assert.equal(result[0].text, 'Parent');
    assert.equal(result[0].children.length, 1);
    assert.equal(result[0].children[0].text, 'Child');
  });

  it('strips "- " prefix from lines', () => {
    const result = parseIndentedLines(['- Top', '  - Sub']);
    assert.equal(result[0].text, 'Top');
    assert.equal(result[0].children[0].text, 'Sub');
  });

  it('handles deep nesting (3 levels)', () => {
    const lines = ['A', '  B', '    C'];
    const result = parseIndentedLines(lines);
    assert.equal(result[0].text, 'A');
    assert.equal(result[0].children[0].text, 'B');
    assert.equal(result[0].children[0].children[0].text, 'C');
  });

  it('handles multiple children at same level', () => {
    const lines = ['Parent', '  Child1', '  Child2'];
    const result = parseIndentedLines(lines);
    assert.equal(result[0].children.length, 2);
    assert.equal(result[0].children[0].text, 'Child1');
    assert.equal(result[0].children[1].text, 'Child2');
  });

  it('skips empty lines', () => {
    const result = parseIndentedLines(['A', '', 'B']);
    assert.equal(result.length, 2);
  });

  it('handles sibling after nested block (dedent)', () => {
    const lines = ['A', '  A1', 'B'];
    const result = parseIndentedLines(lines);
    assert.equal(result.length, 2);
    assert.equal(result[0].text, 'A');
    assert.equal(result[0].children.length, 1);
    assert.equal(result[1].text, 'B');
    assert.equal(result[1].children.length, 0);
  });

  it('all nodes have unique UIDs', () => {
    const lines = ['A', '  B', '  C', 'D'];
    const result = parseIndentedLines(lines);
    const allNodes = [result[0], result[0].children[0], result[0].children[1], result[1]];
    const uids = allNodes.map(n => n.uid);
    assert.equal(new Set(uids).size, uids.length);
  });
});
