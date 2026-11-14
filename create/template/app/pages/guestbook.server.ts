import type { Loader, PageAction } from '@threadlabs/markupkit';

// Messages live in memory, so they reset when the server restarts. Keep real data in a database.
const messages: string[] = [];

export const load = (() => ({ props: { messages } })) satisfies Loader;

export const actions = {
  async default({ request, response }) {
    const message = String((await request.formData()).get('message') ?? '').trim();
    if (message.length < 2 || message.length > 140) {
      response.status = 422;
      return { errors: { message: 'Write between 2 and 140 characters.' }, values: { message } };
    }
    messages.unshift(message);
  },
} satisfies Record<string, PageAction>;
