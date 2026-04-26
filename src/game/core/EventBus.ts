export class EventBus<Events extends Record<string, unknown>> {
  private listeners = new Map<keyof Events, Set<(payload: any) => void>>();

  on<K extends keyof Events>(event: K, handler: (payload: Events[K]) => void) {
    const bucket = this.listeners.get(event) ?? new Set();
    bucket.add(handler as (payload: any) => void);
    this.listeners.set(event, bucket);

    return () => {
      bucket.delete(handler as (payload: any) => void);
    };
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]) {
    const bucket = this.listeners.get(event);
    if (!bucket) {
      return;
    }

    for (const handler of bucket) {
      handler(payload);
    }
  }

  clear() {
    this.listeners.clear();
  }
}
