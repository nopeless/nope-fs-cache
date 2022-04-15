
import { FixedTimeoutFIFOMappedQueue } from '../src/fifo.js';

const fq = new FixedTimeoutFIFOMappedQueue(50, (arg) => {
  console.log('deleted ' + arg);
});

console.log([...fq.entries()].map(e => e.key).join('->'))

while (true) {
  await new Promise(r => setTimeout(r, 10));
  const r = Math.random();
  const e = Math.floor(Math.random() * 10);

  if (r < 0.6) {
    console.log("appending " + e)
    fq.append(e);
  } else if (r) {
    console.log("deleting " + e)
    fq.delete(e)
  }
  console.log(fq.head && fq.head.toString(), fq.tail && fq.tail.toString());
  console.log([...fq.entryMap.values()].map(e => e.toString()).join(' '));
  console.log([...fq.entries()].map(e => e && e.toString()).join('->'))
}
