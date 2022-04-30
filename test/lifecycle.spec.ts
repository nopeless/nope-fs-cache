import { FileSystemCache, FileSystemCacheDelux } from "../src/index.js";
import { expect } from "chai";

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const f = new FileSystemCacheDelux({
  basePath: `./.cache`,
  generator: (key: string) => {
    if (key === `throw`) throw new Error(`throw key`);
    return key;
  },
  toBuffer: (obj) => Buffer.from(obj),
  ttl: 1000,
  transform: (buff) => buff.toString(),
});

setInterval(() => {
  f.fq.debug();
}, 500).unref();

(async () => {
  await sleep(1000);

  const context = await f.get(`hello`);

  console.log(context);

  await f.get(`throw`).catch(() => null);

  console.log(`sleeping`);

  await sleep(500);
})();
