
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

  constructor(public ttl: number, public onDelete: (key: string) => void = () => { }){
    this.ttl = ttl;
    this.onDelete = onDelete;

    this.head = null
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
    if (!entry) return false;

    if (entry === this.head) {
      return this.deleteHead(emitDelete);
    }

    this.entryMap.delete(key);
    emitDelete && this.onDelete(key);

    if (entry === this.tail) {
      this.tail = entry.prev;
      if (!this.tail) throw new InvalidState(`Tail.prev is null`);
      this.tail.next = null;
      return true;
    }

    if (!entry.prev) throw new InvalidState(`Entry.prev is null`);
    entry.prev.next = entry.next;
    if (!entry.next) throw new InvalidState(`Entry.next is null`);
    entry.next.prev = entry.prev;
    entry.next = null
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
    const keys = [...this.entryMap.values()].map(entry => entry.key);
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
    return `[${this.key} prev=${this.prev && this.prev.key} next=${this.next && this.next.key}]`;
  }
}

export { FixedTimeoutFIFOMappedQueue }