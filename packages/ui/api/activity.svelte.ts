/**
 * The requests in flight: how many of the user's calls are waiting for an answer.
 *
 * api.endpoint counts every call that is not `background`. Whoever wants to
 * know that the user is waiting (the line of the works in progress, which
 * looks sooner when a call takes long) reads `pending`; nobody writes it but
 * the client.
 */
class Activity {
  pending = $state(0);
  // The count itself is not reactive: a call starts inside an effect (a view
  // loading), and reading `pending` there would make the effect depend on it.
  #count = 0;

  begin() {
    this.#count += 1;
    this.pending = this.#count;
  }

  end() {
    this.#count = Math.max(0, this.#count - 1);
    this.pending = this.#count;
  }
}

export const activity = new Activity();
