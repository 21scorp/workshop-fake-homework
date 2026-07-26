/**
 * Pool.js — object pooling.
 *
 * A run spawns thousands of bullets and tens of thousands of particles. Letting
 * the GC handle that produces exactly the kind of periodic 40ms hitch that makes
 * a game feel cheap. So: allocate once, reuse forever, never null out.
 */

export class Pool {
  /**
   * @param {() => any} factory     builds a blank instance
   * @param {(o:any) => void} reset  wipes an instance for reuse
   * @param {number} prealloc
   */
  constructor(factory, reset, prealloc = 0) {
    this.factory = factory;
    this.reset = reset;
    /** @type {any[]} */
    this.free = [];
    /** @type {any[]} */
    this.active = [];
    this.created = 0;
    this.peak = 0;
    for (let i = 0; i < prealloc; i++) {
      this.free.push(this.factory());
      this.created++;
    }
  }

  /** Grab an instance and mark it live. */
  spawn() {
    const o = this.free.pop() ?? (this.created++, this.factory());
    this.reset(o);
    o._alive = true;
    this.active.push(o);
    if (this.active.length > this.peak) this.peak = this.active.length;
    return o;
  }

  /** Mark dead. Actual removal happens in sweep() so iteration stays safe. */
  kill(o) { o._alive = false; }

  /** Compact the active list, returning dead instances to the pool. */
  sweep() {
    const a = this.active;
    let w = 0;
    for (let i = 0; i < a.length; i++) {
      const o = a[i];
      if (o._alive) a[w++] = o;
      else this.free.push(o);
    }
    a.length = w;
  }

  clear() {
    for (const o of this.active) { o._alive = false; this.free.push(o); }
    this.active.length = 0;
  }

  get count() { return this.active.length; }

  /** Iterate live instances. The callback may kill() safely. */
  each(fn) {
    const a = this.active;
    for (let i = 0; i < a.length; i++) if (a[i]._alive) fn(a[i], i);
  }
}

/**
 * A ring buffer of fixed capacity. Used for trails: newest wins, oldest is
 * silently discarded, never allocates after construction.
 */
export class Ring {
  constructor(capacity, factory) {
    this.cap = capacity;
    this.items = new Array(capacity);
    for (let i = 0; i < capacity; i++) this.items[i] = factory ? factory() : {};
    this.head = 0;
    this.size = 0;
  }

  /** Returns the slot to write into. */
  push() {
    const slot = this.items[this.head];
    this.head = (this.head + 1) % this.cap;
    if (this.size < this.cap) this.size++;
    return slot;
  }

  /** Iterate newest → oldest. */
  each(fn) {
    for (let i = 0; i < this.size; i++) {
      const idx = (this.head - 1 - i + this.cap * 2) % this.cap;
      if (fn(this.items[idx], i) === false) break;
    }
  }

  clear() { this.head = 0; this.size = 0; }
}
