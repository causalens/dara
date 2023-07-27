import { Command, CommanderError, InvalidArgumentError, OptionValues } from 'commander';
import { getCypressVersion } from './get-cypress-version';
import { existsSync } from 'fs';
import { join } from 'path';

const CWD = process.cwd();
const defaultLockfilePath = './pnpm-lock.yaml';

/**
 * Wraps a message in ANSI error coloring for console output
 *
 * @param str string to wrap
 */
function errorColor(str: string) {
    return `\x1b[31m${str}\x1b[0m`;
}

const program = new Command();

program
    .option('-l, --lockfile <lockfile>', 'relative path to the pnpm lockfile', defaultLockfilePath)
    .action((options: OptionValues) => {
        const lockfilePath = join(CWD, options.lockfile);

        if (!existsSync(lockfilePath)) {
            throw new InvalidArgumentError(`Lockfile could not be found in ${options.lockfile}`);
        }

        const version = getCypressVersion(lockfilePath);

        if (!version) {
            process.stderr.write(`Cypress version not found in ${options.lockfile}`);
        } else {
            process.stdout.write(version);
        }
    });

try {
    program.parse();
} catch (err) {
    const commanderError = err as CommanderError;
    process.stderr.write(`[ERR] ${errorColor(commanderError.message)}`);
    process.exitCode = 1;
}
