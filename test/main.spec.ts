import { expect } from "chai";
import { FileSystemCache } from "../src/index.js";
import { cacheFile } from "./_init.js";
// eslint-disable-next-line no-duplicate-imports
import type Options from "../src/index.js";

function cacheContext(
  executor: (cache: FileSystemCache) => Promise<unknown> | void,
  opts: Partial<Options> = {}
): Promise<void> | undefined {
  const cache = new FileSystemCache({
    basePath: cacheFile,
    ...opts,
  });

  const res = executor(cache);
  if ((res as Promise<unknown>)?.then) {
    return (res as Promise<void>).finally(() => {
      cache.destroy();
    });
  }
  cache.destroy();
  return;
}

describe(`main`, function () {
  it(`Constructor calls`, function () {
    new FileSystemCache();
    new FileSystemCache({
      basePath: cacheFile,
    });
    new FileSystemCache({
      ttl: 1000,
    });
    new FileSystemCache({
      ttl: `5d`,
    });
    new FileSystemCache({
      ignoreTTLWarning: true,
      ttl: 500,
    });
    new FileSystemCache({
      error: (e) => console.log(e),
    });
  });

  it(`(Sync) Should store a cache file`, function () {
    cacheContext((c) => {
      const key = `test`;
      const value = `test`;
      c.setSync(key, Buffer.from(value));
      expect(c.getSync(key).toString())?.to.equal(value);
    });
  });

  it(`(Async) Should store a cache file`, async function () {
    await cacheContext(async (c) => {
      const key = `test`;
      const value = `test`;
      await c.set(key, Buffer.from(value));
      expect((await c.get(key))?.toString()).to.equal(value);
    });
  });
});
