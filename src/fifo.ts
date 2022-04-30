/* eslint-disable no-use-before-define */

class InvalidState extends Error {
  constructor(...args) {
    super(...args);
  }
}

class FixedTimeoutFIFOMappedQueue {
  public head: Data | null = null;
  public tail: Data | null = null;
  public timer: ReturnType<typeof setTimeout> | null = null;
  public entryMap: Map<string, Data> = new Map();

  constructor(
    public ttl: number,
    public onDelete: (_: string) => void = () => {
      return;
    }
  ) {
    if (ttl < 0) throw new Error(`ttl cannot be negative`);
  }

  append(key: string, timestamp: number | null = null): void {
    if (timestamp) {
      if (timestamp < Date.now()) return void this.delete(key, true);
    } else {
      timestamp = Date.now() + this.ttl;
    }

    this.delete(key, false);
    const entry = new Data(key, timestamp);
    this.entryMap.set(key, entry);

    if (!this.head) {
      this.head = this.tail = entry;
      this.setNewHeadTimer();
      return;
    }

    // Lazy load
    if (!this.tail) throw new InvalidState(`tail is null`);
    this.tail.next = entry;
    entry.prev = this.tail;
    this.tail = entry;
  }

  /**
   * Return true if there are remaining items
   */
  deleteHead(emitDelete = true) {
    if (!this.head) throw new InvalidState(`Head is null`);
    this.entryMap.delete(this.head.key);
    if (emitDelete) this.onDelete(this.head.key);
    if (this.head.next) {
      this.head = this.head.next;
      if (!this.head.prev) throw new InvalidState(`Head.prev is null`);
      this.head.prev.next = null;

      this.head.prev = null;
      return true;
    }
    this.head = null;
    this.tail = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    return false;
  }

  setNewHeadTimer() {
    if (!this.head) throw new InvalidState(`Head is null`);
    this.timer = setTimeout(() => {
      if (this.deleteHead(true)) this.setNewHeadTimer();
    }, this.head.ttlTimestamp - Date.now()).unref();
  }

  /**
   * Return true if the item existed
   */
  delete(key: string, emitDelete: boolean): boolean {
    const entry = this.entryMap.get(key);
    if (!entry) return false;

    if (entry === this.head) {
      this.deleteHead(emitDelete);
      return true;
    }

    this.entryMap.delete(key);
    if (emitDelete) this.onDelete(key);

    if (entry === this.tail) {
      if (!emitDelete) {
        // Just a moving process
        entry.ttlTimestamp = Date.now() + this.ttl;
        return true;
      }
      this.tail = entry.prev;
      if (!this.tail) throw new InvalidState(`Tail.prev is null`);
      this.tail.next = null;
      return true;
    }

    if (!entry.prev) throw new InvalidState(`Entry.prev is null`);
    entry.prev.next = entry.next;
    if (!entry.next) throw new InvalidState(`Entry.next is null`);
    entry.next.prev = entry.prev;
    entry.next = null;
    entry.prev = null;
    return true;
  }

  *entries() {
    let entry = this.head;
    while (entry) {
      yield entry;
      entry = entry.next;
    }
  }

  clear(): string[] {
    const keys = [...this.entryMap.values()].map((entry) => entry.key);
    this.entryMap.clear();
    this.head = null;
    this.tail = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    for (const key of keys) {
      this.onDelete(key);
    }
    return keys;
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  start() {
    if (this.timer) return;
    if (this.head) this.setNewHeadTimer();
  }

  destroy() {
    // Attempts to help gc
    for (const node of this.entries()) {
      node.next = null;
      node.prev = null;
    }
    this.head = null;
    this.tail = null;
    this.stop();
    this.entryMap.clear();
  }

  debug() {
    console.log(
      [...this.entries()].map((entry) => entry.toString()).join(`->`) ||
        `[empty]`
    );
  }
}

class Data {
  public prev: Data | null = null;
  public next: Data | null = null;
  constructor(public key: string, public ttlTimestamp: number) {}

  toString() {
    return `[${this.key} prev=${this.prev && this.prev.key} next=${
      this.next && this.next.key
    }]`;
  }
}

export { FixedTimeoutFIFOMappedQueue };
