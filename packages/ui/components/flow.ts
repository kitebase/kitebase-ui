/**
 * A write the server judges (kitebase.flow): the conversation and its outcome.
 *
 * The rules of a table may ask before anything is written. The question comes
 * back on a refusal; `callJudged` shows it, adds the answer and sends the same
 * call again, until the server writes or refuses. The answers live as long as
 * the call: a question asked again tomorrow is asked again, because the data it
 * was about may have changed.
 *
 * A confirm answered no ends the call, as a dismissed dialog does: nothing was
 * written and nothing failed, so the caller only stops. A rule that needs a real
 * two-way answer asks with `choose`.
 */
import { api } from '../api/client';
import type { APIResponse, Flow, FlowQuestion } from '../api/types';
import { msgbox } from './msgbox.svelte';
import { applyResult, type ResultContext } from './resultAction';
import { _ } from '../i18n';

// A rule that asks a new question at every answer would never end.
const MAX_QUESTIONS = 20;

export async function callJudged<T = unknown>(
  op: string, params: Record<string, unknown>, title?: string,
): Promise<APIResponse<T>> {
  const answers: Record<string, unknown> = {};
  for (let i = 0; i < MAX_QUESTIONS; i++) {
    const res = await api.endpoint<T>(op, i === 0 ? params : { ...params, answers });
    const question = res.flow?.ask;
    // Asked again what it was told: the rule ignores its answer, and looping
    // would not change that.
    if (!question || question.key in answers) return res;

    const answer = await ask(question, title);
    if (answer === undefined) return { status: 'error', cancelled: true };
    answers[question.key] = answer;
  }
  return { status: 'error', message: _('The server kept asking: the operation was stopped') };
}

async function ask(question: FlowQuestion, title?: string): Promise<unknown> {
  if (question.kind === 'choose') {
    return msgbox.choose(
      (question.options ?? []).map((o) => ({ label: o.label, value: o.value })),
      title, question.text,
    );
  }
  const yes = await msgbox.confirm(question.text, title,
                                   { confirm: question.yes, cancel: question.no });
  return yes ? true : undefined;
}

/**
 * What follows a save: the lines the rules had for the person, then their
 * actions, applied like any answer of an operation (a file, a page).
 */
export async function presentOutcome(flow: Flow | undefined, ctx: ResultContext): Promise<void> {
  if (!flow) return;
  if (flow.info?.length) await msgbox.alert(flow.info.join('\n'), ctx.title);
  for (const action of flow.actions ?? []) {
    await applyResult({ status: 'success', data: action }, ctx);
  }
}

/** A question dismissed while a frame wrote its tree: nothing written, nothing failed. */
export class FlowCancelled extends Error {
  constructor() { super('cancelled'); }
}

/** A refusal of the rules, with the values the form takes all the same. */
export class FlowRefused extends Error {
  constructor(message: string, public patch?: Record<string, unknown>) { super(message); }
}
