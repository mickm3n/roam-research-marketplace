'use strict';

function pageLocation(pageTitle) {
  return { 'page-title': pageTitle, order: 'last' };
}

function dailyNoteLocation(mmDdYyyy) {
  return { 'page-title': { 'daily-note-page': mmDdYyyy }, order: 'last' };
}

function parentUidLocation(uid) {
  return { 'parent-uid': uid, order: 'last' };
}

function buildFlatActions(location, strings) {
  return strings.map(string => ({
    action: 'create-block',
    location,
    block: { string }
  }));
}

// Builds batch-actions for a tree of nodes using tempids so the whole tree
// is written in a single request. Parent actions must precede child actions.
function buildNestedActions(rootLocation, nodes) {
  let nextTempId = -1;
  const actions = [];

  function processNode(node, location) {
    const tempId = nextTempId--;
    actions.push({
      action: 'create-block',
      location,
      block: { uid: tempId, string: node.text }
    });
    const childLocation = { 'parent-uid': tempId, order: 'last' };
    for (const child of node.children) {
      processNode(child, childLocation);
    }
  }

  for (const node of nodes) {
    processNode(node, rootLocation);
  }

  return actions;
}

module.exports = { pageLocation, dailyNoteLocation, parentUidLocation, buildFlatActions, buildNestedActions };
