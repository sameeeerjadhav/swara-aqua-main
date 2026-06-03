/**
 * Returns error detail only in non-production environments.
 * Prevents internal stack traces / DB errors from leaking to clients.
 */
const isProd = process.env.NODE_ENV === 'production';

export const errDetail = (err: unknown): Record<string, string> =>
  isProd ? {} : { detail: (err as Error).message };
