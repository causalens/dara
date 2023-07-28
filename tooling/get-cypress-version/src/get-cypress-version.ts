import { parse } from 'yaml';
import { readFileSync } from 'fs';

/**
 * Retrieve the cypress version installed in CLDP Core package from the lockfile.
 *
 * @param lockfilePath path to the pnpm-lock.yaml file
 */
export function getCypressVersion(lockfilePath: string): string {
    const file = readFileSync(lockfilePath, 'utf8');
    const parsed = parse(file);

    return parsed?.importers?.['packages/cldp_core']?.devDependencies?.cypress;
}
