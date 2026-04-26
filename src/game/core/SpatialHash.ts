import { Vector3 } from "three";

type HasPosition = {
  position: Vector3;
  _cellKey?: string;
};

export class SpatialHash<T extends HasPosition> {
  private cells = new Map<string, Set<T>>();

  constructor(private readonly cellSize = 18) {}

  private key(x: number, z: number) {
    return `${Math.floor(x / this.cellSize)},${Math.floor(z / this.cellSize)}`;
  }

  insert(item: T) {
    const key = this.key(item.position.x, item.position.z);
    const bucket = this.cells.get(key) ?? new Set<T>();
    bucket.add(item);
    this.cells.set(key, bucket);
    item._cellKey = key;
  }

  update(item: T) {
    const nextKey = this.key(item.position.x, item.position.z);

    if (item._cellKey === nextKey) {
      return;
    }

    this.remove(item);
    const bucket = this.cells.get(nextKey) ?? new Set<T>();
    bucket.add(item);
    this.cells.set(nextKey, bucket);
    item._cellKey = nextKey;
  }

  remove(item: T) {
    if (!item._cellKey) {
      return;
    }

    const bucket = this.cells.get(item._cellKey);
    bucket?.delete(item);

    if (bucket && bucket.size === 0) {
      this.cells.delete(item._cellKey);
    }

    item._cellKey = undefined;
  }

  query(position: Vector3, radius: number) {
    const results = new Set<T>();
    const span = Math.ceil(radius / this.cellSize) + 1;
    const baseX = Math.floor(position.x / this.cellSize);
    const baseZ = Math.floor(position.z / this.cellSize);

    for (let dx = -span; dx <= span; dx += 1) {
      for (let dz = -span; dz <= span; dz += 1) {
        const bucket = this.cells.get(`${baseX + dx},${baseZ + dz}`);
        if (!bucket) {
          continue;
        }

        for (const item of bucket) {
          results.add(item);
        }
      }
    }

    return [...results];
  }

  clear() {
    this.cells.clear();
  }
}
