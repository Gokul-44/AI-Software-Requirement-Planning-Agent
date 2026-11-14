import { readFileSync } from 'node:fs';

/**
 * Reads the idea for the live scripts (live-run, golden-record) without trusting shell-split
 * argument lists. On Windows, `npm run x -- "an idea"` goes through cmd.exe, which can turn every
 * space into `^ ` and prefix words with `^`; one stored run got "^I^ want^ an^ ..." that way.
 *
 * Sources, first match wins:
 *   --idea-file <path>   a UTF-8 text file (safest on Windows)
 *   --idea <text>        the words after the flag, up to the next `--flag`
 *   IDEA                 environment variable
 * Anything else is ignored, so a stray positional word is never mistaken for the idea.
 */
export interface IdeaSources {
  argv: readonly string[];
  env?: Record<string, string | undefined>;
  readFile?: (path: string) => string;
}

/** Removes the `^` escapes cmd.exe leaves behind, only when the text shows the pattern. */
export function stripCmdCarets(text: string): string {
  return /^\^|\^\s/.test(text) ? text.replace(/\^(.?)/gs, '$1') : text;
}

function flagValue(argv: readonly string[], flag: string): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? '';
    if (arg.startsWith(`${flag}=`)) return arg.slice(flag.length + 1);
    if (arg === flag) {
      const words: string[] = [];
      for (let j = i + 1; j < argv.length && !(argv[j] ?? '').startsWith('--'); j++) {
        words.push(argv[j] ?? '');
      }
      return words.join(' ');
    }
  }
  return undefined;
}

export function readIdea(sources: IdeaSources): string | undefined {
  const read = sources.readFile ?? ((p: string) => readFileSync(p, 'utf8'));
  const file = flagValue(sources.argv, '--idea-file');
  const raw =
    file !== undefined && file.trim() !== ''
      ? read(file.trim())
      : (flagValue(sources.argv, '--idea') ?? sources.env?.['IDEA']);
  if (raw === undefined) return undefined;
  const idea = stripCmdCarets(raw.replace(/^\uFEFF/, ''))
    .replace(/\s+/g, ' ')
    .trim();
  return idea === '' ? undefined : idea;
}
