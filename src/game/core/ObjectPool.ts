export class ObjectPool<T> {
  private pool: T[];
  private free: T[];

  constructor(
    create: () => T,
    private readonly reset: (item: T) => void,
    size: number
  ) {
    this.pool = Array.from({ length: size }, create);
    this.free = [...this.pool];
  }

  acquire() {
    return this.free.pop() ?? null;
  }

  release(item: T) {
    this.reset(item);
    this.free.push(item);
  }

  get size() {
    return this.pool.length;
  }
}
