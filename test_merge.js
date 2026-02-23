const orig = [
  { type: 'folderHeader', folderId: 'a' },
  { type: 'folderMergeZone', targetFolderId: 'a' },
  { type: 'folderTaskGroup', folderId: 'a', tasks: [1,2] },
  { type: 'folderHeader', folderId: 'b' },
  { type: 'folderMergeZone', targetFolderId: 'b' },
  { type: 'folderTaskGroup', folderId: 'b', tasks: [3] }
];

function dropMergeCancel(data, from, to) {
  const reverted = [...data];
  const [item] = reverted.splice(to, 1);
  reverted.splice(from, 0, item);
  return reverted;
}

function dropMergeYes(data, from, to, draggedItem) {
  // Move tasks to target, keep header at original pos but empty.
  // We need to keep the dragged block right where it started.
  // So the user dragged 'from' to 'to'. The flatlist already mutated `data` slightly if `from !== to` conceptually but the param `data` is currently the reordered list. Wait, in `onDragEnd({data, from, to})`, `data` is the NEW list.
  // The actual `reverted` logic used works to undo `data`.
  return dropMergeCancel(data, from, to);
}

// 0 to 4 drop:
// orig order: A B
// new order: B A (from 0 to 3 or 4)
const droppedData = [
  ...orig.slice(3, 6),
  orig[0],
  orig[1],
  orig[2],
];

console.log(dropMergeCancel(droppedData, 0, 3).map(i => i.folderId || i.targetFolderId).join(' ')); // expects a a a b b b 
