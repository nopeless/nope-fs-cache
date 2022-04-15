import path from "path";
import fs from "fs";
const fsp = fs.promises;
import { createHash } from "crypto";

import ms from "ms";

import { FixedTimeoutFIFOMappedQueue } from "./fifo.js";

type Entries = { filename: string; atime: number }[];

function sha256(str: string) {
  return createHash(`sha256`).update(str).digest(`hex`);
}

function atime(f: string) {
  return fs.statSync(f).atimeMs;
}

class FileSystemCache {
  public ttl: number;
  public cachePath: string;
  public fq: FixedTimeoutFIFOMappedQueue;
  public error: typeof console.log;
  public generator: ((key: string) => Buffer) | null;
  public generatorAsync: ((key: string) => Promise<Buffer> | Buffer) | null;

  /**
   * If skipInit is true, you must initialize the cache via #initAsync()
   */
  constructor(options?: {
    basePath: `./cache`;
    ttl: number | `30d`;
    ignoreTTLWarning: false;
    skipInit: false;
    generator: InstanceType<typeof FileSystemCache>[`generator`];
    generatorAsync: InstanceType<typeof FileSystemCache>[`generatorAsync`];
    error: typeof console.log;
  }) {
    options = {
      basePath: `./cache`,
      ttl: `30d`,
      ignoreTTLWarning: false,
      skipInit: false,
      error: console.log,
      generator: null,
      generatorAsync: null,
      ...options,
    };

    if (typeof options.ttl === `string`) {
      this.ttl = ms(options.ttl) as number;
    } else {
      this.ttl = options.ttl;
    }

    if (!options.ignoreTTLWarning && this.ttl % 1000) {
      // Does not end with 000
      throw new Error(`ttl must be in second unit`);
    }

    if (path.isAbsolute(options.basePath)) {
      this.cachePath = options.basePath;
    } else {
      this.cachePath = path.join(process.cwd(), options.basePath);
    }

    if (this.cachePath.length + 64 + 1 > 260) {
      throw new Error(`cachePath is too long`);
    }

    this.error = options.error;

    this.generator = options.generator;

    this.fq = new FixedTimeoutFIFOMappedQueue(this.ttl, (key) => {
      this.#unlink(key).catch((e) => {
        this.error(e);
      });
    });

    if (!options.skipInit) {
      // Synchronously initialize
      fs.existsSync(this.cachePath) || fs.mkdirSync(this.cachePath);

      const entries: Entries = [];
      for (const filename of fs.readdirSync(this.cachePath)) {
        entries.push({
          filename,
          atime: atime(path.resolve(this.cachePath, filename)),
        });
      }
      entries.sort((a, b) => b.atime - a.atime);

      for (const entry of entries) {
        this.fq.append(entry.filename, entry.atime + this.ttl);
      }
    }
  }

  async initAsync() {
    const entries: Entries = [];

    let dir: string[] = [];
    try {
      dir = await fsp.readdir(this.cachePath);
    } catch (e) {
      if (e.code === `ENOENT`) {
        await fsp.mkdir(this.cachePath);
      } else {
        throw e;
      }
    }

    for (const filename of dir) {
      entries.push({
        filename,
        atime: atime(path.resolve(this.cachePath, filename)),
      });
    }
    entries.sort((a, b) => b.atime - a.atime);

    for (const entry of entries) {
      this.fq.append(entry.filename, entry.atime + this.ttl);
    }
  }

  async #unlink(key: string) {
    return fsp.unlink(path.join(this.cachePath, key));
  }

  remove(key: string) {
    this.fq.delete(sha256(key));
  }

  getSync(key: string): Buffer | null {
    const hash = sha256(key);
    this.fq.append(hash);
    try {
      return fs.readFileSync(path.join(this.cachePath, hash));
    } catch (e) {
      if (e.code === `ENOENT`) {
        return typeof this.generator === `function`
          ? this.generator(key)
          : null;
      }
      throw e;
    }
  }

  async get(key: string): Promise<Buffer | null> {
    const hash = sha256(key);
    this.fq.append(hash);
    try {
      return await fsp.readFile(path.join(this.cachePath, hash));
    } catch (e) {
      if (e.code === `ENOENT`) {
        return typeof this.generatorAsync === `function`
          ? this.generatorAsync(key)
          : null;
      }
      throw e;
    }
  }

  setSync(key: string, buff: Buffer) {
    const hash = sha256(key);
    this.fq.append(sha256(key));
    fs.writeFileSync(path.join(this.cachePath, hash), buff);
  }

  async set(key: string, buff: Buffer) {
    const hash = sha256(key);
    this.fq.append(sha256(key));
    await fsp.writeFile(path.join(this.cachePath, hash), buff);
  }

  async clear() {
    const keys = this.fq.clear();
    return Promise.all(keys.map((key) => this.#unlink(key)));
  }
}

export { FileSystemCache };
