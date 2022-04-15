import { FileSystemCache } from "../src/filecache.js";

const fc = new FileSystemCache({
  ttl: 2000,
  skipInit: true,
});

await fc.initAsync();

fc.setSync(`foo`, Buffer.from(`bar`));

let str = fc.getSync(`foo`).toString();

console.log(str);

await new Promise((r) => {
  setTimeout(r, 10000);
});

// Should be null now
str = fc.getSync(`foo`);

console.log(str);
