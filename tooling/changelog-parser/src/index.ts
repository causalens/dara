import { Command, CommanderError, InvalidArgumentError, OptionValues } from 'commander';
import { existsSync } from 'fs';
import { join } from 'path';

import { getChangelogForTag } from './get-changelog';

const CWD = process.cwd();
const PACKAGES_PATH = '/packages';

/**
 * Wraps a message in ANSI error coloring for console output
 *
 * @param str string to wrap
 */
function errorColor(str: string) {
    return `\x1b[31m${str}\x1b[0m`;
}

// CLI definition
const program = new Command();
program
    .argument('<tag>', 'release tag to parse changelog for')
    .option('-d, --directory <directory>', 'root directory containing "packages" directory', CWD)
    .action((tag: string, options: OptionValues) => {
        if (!existsSync(join(options.directory, PACKAGES_PATH))) {
            throw new InvalidArgumentError(`Packages directory could not be found in ${options.directory}`);
        }

        getChangelogForTag(tag, join(options.directory, PACKAGES_PATH)).then((changelog: string[]) =>
            process.stdout.write(JSON.stringify(changelog))
        );
    });

try {
    program.parse();
} catch (err) {
    const commanderError = err as CommanderError;
    process.stderr.write(`[ERR] ${errorColor(commanderError.message)}`);
    process.exitCode = 1;
}
