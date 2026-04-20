'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { parsePullResult, formatBlockTree } = require('../lib/pull-parser');

const pullPage = require('./fixtures/pull-page.json');
const pullBlock = require('./fixtures/pull-block.json');

describe('parsePullResult', () => {
  it('returns null for null input', () => {
    assert.equal(parsePullResult(null), null);
  });

  it('returns null if node has no :block/uid', () => {
    assert.equal(parsePullResult({ ':block/string': 'orphan' }), null);
  });

  it('parses a leaf block', () => {
    const result = parsePullResult({
      ':block/uid': 'abc',
      ':block/string': 'hello',
      ':block/order': 3,
      ':block/children': []
    });
    assert.equal(result.uid, 'abc');
    assert.equal(result.string, 'hello');
    assert.equal(result.order, 3);
    assert.deepEqual(result.children, []);
  });

  it('defaults string to empty string when missing', () => {
    const result = parsePullResult({ ':block/uid': 'x' });
    assert.equal(result.string, '');
  });

  it('sorts children by order even if fixture has wrong order', () => {
    const pageResult = parsePullResult(pullPage.result);
    assert.equal(pageResult.uid, 'page-uid-1');
    const children = pageResult.children;
    assert.equal(children.length, 3);
    assert.equal(children[0].uid, 'block-a');
    assert.equal(children[1].uid, 'block-b');
    assert.equal(children[2].uid, 'block-c');
  });

  it('recursively parses nested children', () => {
    const pageResult = parsePullResult(pullPage.result);
    const firstBlock = pageResult.children[0];
    assert.equal(firstBlock.children.length, 2);
    assert.equal(firstBlock.children[0].uid, 'block-a1');
    assert.equal(firstBlock.children[1].uid, 'block-a2');

    const grandchild = firstBlock.children[1].children[0];
    assert.equal(grandchild.uid, 'block-a2a');
    assert.equal(grandchild.string, 'Deep grandchild');
  });

  it('parses a block (non-page) with children', () => {
    const result = parsePullResult(pullBlock.result);
    assert.equal(result.uid, 'root-block-uid');
    assert.equal(result.string, 'Root block');
    assert.equal(result.children.length, 2);
    assert.equal(result.children[0].uid, 'child-1');
    assert.equal(result.children[1].uid, 'child-2');
  });
});

describe('formatBlockTree', () => {
  it('returns empty string for empty blocks', () => {
    assert.equal(formatBlockTree([]), '');
  });

  it('formats a single block', () => {
    const blocks = [{ uid: 'a', string: 'hello', order: 0, children: [] }];
    assert.equal(formatBlockTree(blocks), '- hello\n');
  });

  it('indents nested blocks', () => {
    const blocks = [{
      uid: 'a', string: 'parent', order: 0,
      children: [{ uid: 'b', string: 'child', order: 0, children: [] }]
    }];
    assert.equal(formatBlockTree(blocks), '- parent\n  - child\n');
  });

  it('handles multiple levels of nesting', () => {
    const pageResult = parsePullResult(pullPage.result);
    const output = formatBlockTree(pageResult.children);
    assert.ok(output.includes('- First block\n'));
    assert.ok(output.includes('  - Nested child A1\n'));
    assert.ok(output.includes('  - Nested child A2\n'));
    assert.ok(output.includes('    - Deep grandchild\n'));
  });
});
