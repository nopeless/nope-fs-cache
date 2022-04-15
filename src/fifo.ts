/* eslint-disable no-use-before-define */

type Key = string;

class InvalidState extends Error {
  constructor(...args) {
    super(...args);
  }
}

class FixedTimeoutFIFOMappedQueue {
  public head: Data | null;
  public tail: Data | null;
  public timer: ReturnType<typeof setTimeout> | null;
  public entryMap: Map<Key, Data>;

  constructor(
    public ttl: number,
    public onDelete: (_: string) => void = () => {
      return;
    }
  ) {
    this.ttl = ttl;
    this.onDelete = onDelete;

    this.head = null;
    this.tail = null;

    this.timer = null;
    this.entryMap = new Map();
  }

  append(key, timestamp: number | null = null) {
    this.delete(key, false);
    const entry = new Data(key, timestamp || Date.now() + this.ttl);
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

  deleteHead(emitDelete = true) {
    if (!this.head) throw new InvalidState(`Head is null`);
    this.entryMap.delete(this.head.key);
    emitDelete && this.onDelete(this.head.key);
    if (this.head.next) {
      this.head = this.head.next;
      if (!this.head.prev) throw new InvalidState(`Head.prev is null`);
      this.head.prev.next = null;

      this.head.prev = null;
      return true;
    }
    this.head = null;
    this.tail = null;
    this.timer && clearTimeout(this.timer);
    this.timer = null;
    return false;
  }

  setNewHeadTimer() {
    if (!this.head) throw new InvalidState(`Head is null`);
    this.timer = setTimeout(() => {
      this.deleteHead(true) && this.setNewHeadTimer();
    }, this.head.ttlTimestamp - Date.now()).unref();
  }

  delete(key, emitDelete = true) {
    const entry = this.entryMap.get(key);
    if (!entry) return;

    if (entry === this.head) {
      this.deleteHead(emitDelete);
      return;
    }

    this.entryMap.delete(key);
    emitDelete && this.onDelete(key);

    if (entry === this.tail) {
      if (!emitDelete) {
        // Just a moving process
        entry.ttlTimestamp = Date.now() + this.ttl;
        return;
      }
      this.tail = entry.prev;
      if (!this.tail) throw new InvalidState(`Tail.prev is null`);
      this.tail.next = null;
      return;
    }

    if (!entry.prev) throw new InvalidState(`Entry.prev is null`);
    entry.prev.next = entry.next;
    if (!entry.next) throw new InvalidState(`Entry.next is null`);
    entry.next.prev = entry.prev;
    entry.next = null;
    entry.prev = null;
    return;
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
    this.timer && clearTimeout(this.timer);
    this.timer = null;
    for (const key of keys) {
      this.onDelete(key);
    }
    return keys;
  }

  stop() {
    this.timer && clearTimeout(this.timer);
    this.timer = null;
  }

  start() {
    if (this.timer) return;
    this.head && this.setNewHeadTimer();
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
      [...this.entries()].map((entry) => entry.toString()).join(`->`)
    );
  }
}

class Data {
  public prev: Data | null;
  public next: Data | null;
  constructor(public key: Key, public ttlTimestamp: number) {
    this.key = key;
    this.ttlTimestamp = ttlTimestamp;
    this.prev = null;
    this.next = null;
  }

  toString() {
    return `[${this.key} prev=${this.prev && this.prev.key} next=${
      this.next && this.next.key
    }]`;
  }
}

export { FixedTimeoutFIFOMappedQueue };
