const orig = ['A0', 'A1', 'A2', 'B0', 'B1', 'B2', 'C0', 'C1', 'C2'];
function move(arr, from, to) {
  const res = [...arr];
  const item = res.splice(from, 1)[0];
  res.splice(to, 0, item);
  return res;
}

console.log("0 to 5:", move(orig, 0, 5).map((v, i) => `${i}:${v}`).join(' '));
console.log("6 to 3:", move(orig, 6, 3).map((v, i) => `${i}:${v}`).join(' '));
