'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  pageLocation, dailyNoteLocation, parentUidLocation,
  buildFlatActions, buildNestedActions
} = require('../lib/batch-builder');

describe('location helpers', () => {
  it('pageLocation returns correct structure', () => {
    assert.deepEqual(pageLocation('My Page'), { 'page-title': 'My Page', order: 'last' });
  });

  it('dailyNoteLocation returns correct structure', () => {
    assert.deepEqual(dailyNoteLocation('04-20-2026'), {
      'page-title': { 'daily-note-page': '04-20-2026' },
      order: 'last'
    });
  });

  it('parentUidLocation returns correct structure', () => {
    assert.deepEqual(parentUidLocation('abc123'), { 'parent-uid': 'abc123', order: 'last' });
  });
});

describe('buildFlatActions', () => {
  it('creates one action per string', () => {
    const loc = pageLocation('Test Page');
    const actions = buildFlatActions(loc, ['Block A', 'Block B']);
    assert.equal(actions.length, 2);
    assert.equal(actions[0].action, 'create-block');
    assert.equal(actions[0].block.string, 'Block A');
    assert.deepEqual(actions[0].location, loc);
    assert.equal(actions[1].block.string, 'Block B');
  });

  it('returns empty array for empty strings', () => {
    assert.deepEqual(buildFlatActions(pageLocation('X'), []), []);
  });
});

describe('buildNestedActions', () => {
  it('single flat node produces one action', () => {
    const loc = pageLocation('My Page');
    const nodes = [{ text: 'Hello', children: [] }];
    const actions = buildNestedActions(loc, nodes);
    assert.equal(actions.length, 1);
    assert.equal(actions[0].action, 'create-block');
    assert.equal(actions[0].block.string, 'Hello');
    assert.deepEqual(actions[0].location, loc);
    assert.equal(typeof actions[0].block.uid, 'number');
    assert.ok(actions[0].block.uid < 0);
  });

  it('parent action comes before child action', () => {
    const loc = pageLocation('My Page');
    const nodes = [{
      text: 'Parent',
      children: [{ text: 'Child', children: [] }]
    }];
    const actions = buildNestedActions(loc, nodes);
    assert.equal(actions.length, 2);
    const parentAction = actions[0];
    const childAction = actions[1];
    assert.equal(parentAction.block.string, 'Parent');
    assert.equal(childAction.block.string, 'Child');
    assert.equal(childAction.location['parent-uid'], parentAction.block.uid);
  });

  it('deep tree produces actions in depth-first order', () => {
    const nodes = [{
      text: 'A',
      children: [
        { text: 'A1', children: [{ text: 'A1a', children: [] }] },
        { text: 'A2', children: [] }
      ]
    }];
    const actions = buildNestedActions(pageLocation('P'), nodes);
    assert.equal(actions.length, 4);
    assert.equal(actions[0].block.string, 'A');
    assert.equal(actions[1].block.string, 'A1');
    assert.equal(actions[2].block.string, 'A1a');
    assert.equal(actions[3].block.string, 'A2');
    assert.equal(actions[1].location['parent-uid'], actions[0].block.uid);
    assert.equal(actions[2].location['parent-uid'], actions[1].block.uid);
    assert.equal(actions[3].location['parent-uid'], actions[0].block.uid);
  });

  it('all tempids are unique negative integers', () => {
    const nodes = [
      { text: 'X', children: [] },
      { text: 'Y', children: [] }
    ];
    const actions = buildNestedActions(pageLocation('P'), nodes);
    const uids = actions.map(a => a.block.uid);
    assert.equal(new Set(uids).size, uids.length);
    assert.ok(uids.every(uid => typeof uid === 'number' && uid < 0));
  });

  it('multiple root nodes each use root location', () => {
    const loc = dailyNoteLocation('04-20-2026');
    const nodes = [
      { text: 'First', children: [] },
      { text: 'Second', children: [] }
    ];
    const actions = buildNestedActions(loc, nodes);
    assert.equal(actions.length, 2);
    assert.deepEqual(actions[0].location, loc);
    assert.deepEqual(actions[1].location, loc);
  });
});
