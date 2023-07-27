import { existsSync } from 'fs';
import { readdir, readFile, writeFile } from 'fs/promises';
import { join, sep } from 'path';
import slackifyMarkdown from 'slackify-markdown';

const EMPTY_LINE = '';
const NEXT_TAG = 'NEXT';

/**
 * Get changelog content for a given heading
 *
 * @param heading heading to look for
 * @param lines changelog file to look in
 */
function getSectionForHeading(heading: string, lines: string[]): [content: string | null, position: number] {
    // Find position of specified heading
    // We assume the tag lines are heading lines (i.e. they start with some number of #s)
    const headingPosition = lines.findIndex((line) => line.startsWith('#') && line.includes(heading));

    if (headingPosition === -1) return [null, headingPosition];

    // Get the heading level markdown (i.e. '##') of the tag section heading line
    const headingMarkdown = (lines[headingPosition].match(/#/g) ?? []).join('');

    // Find the position of the next tag line (i.e a heading with the same markdown)
    const previousTagPosition = lines.findIndex(
        (line, index) => index > headingPosition && line.startsWith(headingMarkdown)
    );

    // Get changelog content
    // If there is no tag before the current one, get content until end of file
    return [
        lines
            .slice(headingPosition + 1, previousTagPosition !== -1 ? previousTagPosition : undefined)
            .filter((line) => line.trim().length !== 0)
            .join('\n'),
        headingPosition,
    ];
}

/**
 * Parses changelog files in each ROOT_DIR/packages/PACKAGE_NAME/docs/changelog.md file.
 * Returns the changelog as an array of changelog sections.
 *
 * @param tag tag to parse changelog for
 * @param rootDirectory root directory of packages folder folder
 */
export async function getChangelogForTag(tag: string, rootDirectory: string): Promise<string[]> {
    // Get existing paths of changelogs
    const changelogPaths = (await readdir(rootDirectory))
        .filter((folderName) => !folderName.startsWith('.'))
        .map((folderName) => join(rootDirectory, folderName, 'changelog.md'))
        .filter((changelogPath) => existsSync(changelogPath));

    // Array of sections
    const changelogSections: string[] = [];

    const tasks: Promise<any>[] = [];

    for (const path of changelogPaths) {
        const packageName = path.split(sep).slice(-2, -1);
        const content = await readFile(path, { encoding: 'utf-8' });
        const lines = content.split('\n');

        const [tagChangelog] = getSectionForHeading(tag, lines);
        const [nextChangelog, nextPosition] = getSectionForHeading(NEXT_TAG, lines);

        // If there's neither a section for the tag or a NEXT section, skip
        if (!tagChangelog && !nextChangelog) continue;

        if (nextChangelog) {
            lines[nextPosition] = `## ${tag}`;
            tasks.push(writeFile(path, lines.join('\n')));
        }

        const changelogSection = [`## ${packageName}`, EMPTY_LINE, tagChangelog, nextChangelog]
            .filter((line) => line === EMPTY_LINE || Boolean(line))
            .join('\n');
        changelogSections.push(slackifyMarkdown(changelogSection));
    }

    await Promise.allSettled(tasks);

    // Postprocess - escape newlines
    return changelogSections.map((section) => section.replace(/\n/g, '\\n'));
}
