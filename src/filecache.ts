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

type Options = {
  readonly basePath?: string;
  readonly ttl?: number | string;
  readonly ignoreTTLWarning?: boolean;
  readonly skipInit?: boolean;
  error?: (e: Error) => void;
};

type OptionsDelux<T> = {
  readonly generatorSync: (key: string) => T;
  readonly toBufferSync: (value: T) => Buffer;
  readonly transformSync: (buff: Buffer) => T;

  generator: (key: string) => Promise<T> | T;
  toBuffer: (value: T) => Promise<Buffer> | Buffer;
  transform: (buff: Buffer) => Promise<T> | T;
};

const defaultOptions: Required<Options> = {
  basePath: `./cache`,
  ttl: `1d`,
  ignoreTTLWarning: false,
  skipInit: false,
  error: console.log,
};

class FileSystemCacheBase {
  public readonly ttl: number;
  public readonly cachePath: string;
  public readonly fq: FixedTimeoutFIFOMappedQueue;
  public error: typeof console.log;

  /**
   * If skipInit is true, you must initialize the cache via #initAsync()
   */
  constructor(options?: Options) {
    const opts: Required<Options> = {
      ...defaultOptions,
      ...options,
    };

    if (typeof opts.ttl === `string`) {
      this.ttl = ms(opts.ttl);
    } else {
      this.ttl = opts.ttl;
    }

    if (!opts.ignoreTTLWarning && this.ttl % 1000) {
      // Does not end with 000
      throw new Error(`ttl must be in second unit`);
    }

    // Max 32 bit signed int
    if (this.ttl > 2147483647) {
      throw new Error(
        `ttl must be less than 2147483647 (or aproximately 24.8 days)`
      );
    }

    if (path.isAbsolute(opts.basePath)) {
      this.cachePath = opts.basePath;
    } else {
      this.cachePath = path.join(process.cwd(), opts.basePath);
    }

    if (this.cachePath.length + 64 + 1 > 260) {
      throw new Error(`cachePath is too long`);
    }

    this.error = opts.error;

    this.fq = new FixedTimeoutFIFOMappedQueue(this.ttl, (key) => {
      this.#unlink(key).catch((e) => {
        this.error(e);
      });
    });

    if (!opts.skipInit) {
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
    return this.fq.delete(sha256(key));
  }

  protected getBufferSync(key: string): Buffer | null {
    const hash = sha256(key);
    this.fq.append(hash);
    try {
      return fs.readFileSync(path.join(this.cachePath, hash));
    } catch (e) {
      if (e.code === `ENOENT`) {
        return null;
      }
      throw e;
    }
  }

  protected async getBuffer(key: string): Promise<Buffer | null> {
    const hash = sha256(key);
    this.fq.append(hash);
    try {
      return await fsp.readFile(path.join(this.cachePath, hash));
    } catch (e) {
      if (e.code === `ENOENT`) {
        return null;
      }
      throw e;
    }
  }

  async clear() {
    const keys = this.fq.clear();
    return Promise.all(keys.map((key) => this.#unlink(key)));
  }

  destroy() {
    this.fq.destroy();
  }
}

class FileSystemCache extends FileSystemCacheBase {
  constructor(...args: ConstructorParameters<typeof FileSystemCacheBase>) {
    super(...args);
  }

  getSync(key: string): Buffer | null {
    return super.getBufferSync(key);
  }

  async get(key: string): Promise<Buffer | null> {
    return super.getBuffer(key);
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
}

class FileSystemCacheDelux<T> extends FileSystemCacheBase {
  public syncEnabled: boolean;

  public readonly generatorSync: (key: string) => T;
  public readonly toBufferSync: (value: T) => Buffer;
  public readonly transformSync: (buff: Buffer) => T;

  public readonly generator: (key: string) => Promise<T> | T;
  public readonly toBuffer: (value: T) => Promise<Buffer> | Buffer;
  public readonly transform: (buff: Buffer) => Promise<T> | T;

  constructor(options: Options & Partial<OptionsDelux<T>>) {
    const opts: Options & Partial<OptionsDelux<T>> = {
      ...defaultOptions,
      ...options,
    };

    super(opts);

    // Assign sync methods to async if they don't exist
    opts.generator ??= opts.generatorSync;
    opts.toBuffer ??= opts.toBufferSync;
    opts.transform ??= opts.transformSync;

    // Check requirements
    if (!opts.generator) {
      throw new Error(`generator or generatorSync must be provided`);
    }
    if (!opts.toBuffer) {
      throw new Error(`toBuffer or toBufferSync must be provided`);
    }
    if (!opts.transform) {
      throw new Error(`transform or transformSync must be provided`);
    }

    this.syncEnabled = !!(
      opts.generatorSync &&
      opts.toBufferSync &&
      opts.transformSync
    );
  }

  async get(key: string): Promise<T> {
    const res: Buffer | null = await super.getBuffer(key);
    if (res === null) {
      const obj = await this.generator(key);
      (async () => this.toBuffer(obj))()
        .then((buff) => {
          FileSystemCache.prototype.set.bind(this)(key, buff);
        })
        .catch((e) => {
          this.error(e);
        });
      return obj;
    }
    return this.transform(res);
  }

  getSync(key: string): T {
    if (!this.syncEnabled)
      throw new Error(`Sync methods were not implemented. Read the docs`);

    const res: Buffer | null = this.getBufferSync(key);

    if (res === null) {
      const obj = this.generatorSync(key);
      FileSystemCache.prototype.setSync.bind(this)(key, this.toBuffer(obj));
      return obj;
    } else {
      return this.transformSync(res);
    }
  }
}

export { FileSystemCache, FileSystemCacheDelux };
export type { Options };
