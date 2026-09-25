/**
 * Small terminal helpers for the server-console commands in this folder that must
 * prompt for a secret (currently reset-admin-password.ts). Nothing here logs or stores input.
 */
import * as readline from 'node:readline';

export class CliError extends Error {
  constructor(
    message: string,
    readonly exitCode = 1,
  ) {
    super(message);
  }
}

/** Reads a line from the terminal without echoing it. Requires a real TTY. */
export function promptHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    process.stdout.write(question);
    const chars: string[] = [];
    readline.emitKeypressEvents(stdin);
    stdin.setRawMode(true);
    stdin.resume();
    const onKey = (str: string | undefined, key: { name?: string; ctrl?: boolean }) => {
      if (key?.ctrl && key.name === 'c') {
        cleanup();
        reject(new CliError('Cancelled. Nothing was changed.', 130));
      } else if (key?.name === 'return' || key?.name === 'enter') {
        cleanup();
        process.stdout.write('\n');
        resolve(chars.join(''));
      } else if (key?.name === 'backspace') {
        chars.pop();
      } else if (str && !key?.ctrl) {
        chars.push(str);
      }
    };
    const cleanup = () => {
      stdin.off('keypress', onKey);
      stdin.setRawMode(false);
      stdin.pause();
    };
    stdin.on('keypress', onKey);
  });
}

export function promptVisible(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve, reject) => {
    let answered = false;
    rl.on('SIGINT', () => {
      reject(new CliError('Cancelled. Nothing was changed.', 130)); // first: closing the interface fires 'close' below
      rl.close();
    });
    // Ctrl-D / closed terminal: without this the promise would never settle and the process would exit 0.
    rl.on('close', () => {
      if (!answered) reject(new CliError('Input closed. Nothing was changed.', 1));
    });
    rl.question(question, (answer) => {
      answered = true;
      rl.close();
      resolve(answer);
    });
  });
}

/** Host + database name only, never the credentials part of DATABASE_URL. */
export function describeTarget(): { database: string; host: string } {
  try {
    const url = new URL(process.env.DATABASE_URL ?? '');
    return { database: url.pathname.replace(/^\//, ''), host: url.hostname };
  } catch {
    return { database: '(unknown)', host: '(unknown)' };
  }
}
