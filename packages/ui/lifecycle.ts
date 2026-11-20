/**
 * What happens to forms and frames, for whoever wants to know.
 *
 * The library emits; anyone listens, a plugin component above all: one that
 * shows who else is editing a document needs to know when this one is opened,
 * changed, saved and closed, and when the person moves between frames. A
 * form's own `onEvent` speaks to the component that holds it; this speaks to
 * everyone, wherever they are mounted.
 *
 * Nothing here is a guarantee: a tab closed from its handle closes no form. A
 * listener uses the events as signs of activity, never as what correctness
 * rests on.
 *
 *   const off = lifecycle.on('form:change', (form) => ...);
 *   off();   // on destroy
 */

/** Which form an event is about: the record of a page, as one frame shows it. */
export interface FormRef {
  /** Unique to this opening: the same record open twice is two forms. */
  key: string;
  /** The page the form belongs to: the tree it reads and writes. */
  page: string;
  model: string;
  /** The record; none for a new one until it is saved. */
  id: string | number | null;
}

export interface LifecycleEvents {
  /** A form is shown, on a record read or a new one. */
  'form:open': FormRef;
  /** The person changed a field, every time: a listener debounces if it must. */
  'form:change': FormRef;
  /** The form became dirty, or clean again (saved, discarded, put back). */
  'form:dirty': FormRef & { dirty: boolean };
  /** The record reached the database; `id` is its key now. */
  'form:saved': FormRef;
  /** The form left the page, however it left. */
  'form:close': FormRef;
  /** A frame was opened on the stack, or closed. */
  'stack:push': { frame: string; depth: number };
  'stack:pop': { frame: string; depth: number };
}

export type LifecycleEvent = keyof LifecycleEvents;
type Handler<E extends LifecycleEvent> = (payload: LifecycleEvents[E]) => void;

export function createLifecycle() {
  const handlers = new Map<LifecycleEvent, Set<Handler<LifecycleEvent>>>();

  return {
    /** Listen to one event; the answer stops listening. */
    on<E extends LifecycleEvent>(event: E, handler: Handler<E>): () => void {
      let set = handlers.get(event);
      if (!set) handlers.set(event, (set = new Set()));
      set.add(handler as Handler<LifecycleEvent>);
      return () => { set!.delete(handler as Handler<LifecycleEvent>); };
    },

    emit<E extends LifecycleEvent>(event: E, payload: LifecycleEvents[E]): void {
      for (const handler of [...(handlers.get(event) ?? [])]) {
        // One listener that throws must not keep the others, nor the form, from going on
        try {
          handler(payload);
        } catch (e) {
          console.error(`[lifecycle] a '${event}' listener failed`, e);
        }
      }
    },
  };
}

export const lifecycle = createLifecycle();

let counter = 0;
/** A key for a form's opening, unique within this page. */
export function formKey(): string {
  return `form-${(counter += 1)}`;
}
