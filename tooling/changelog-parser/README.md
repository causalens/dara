## Changelog-parser

This is a simple CLI tool that collects and merges changelog entries for a given tag.
By default it assumes it's ran from the base platform folder so that it accesses changelogs under `CWD/packages/PACKAGE_NAME/docs/changelog.md`.
It accepts an optional `-d` or `--directory` param which overrides the `CWD` to a specified path.

The CLI transforms the Markdown into Slack's custom `mrkdwn` format so that it can be posted in a Slack channel.

Example usage:

```bash
# Ran from the root
./tooling/changelog-parser/main.js 1.11.49
```

### Development

This package is using `esbuild` to bundle and minify the script into a single runnable.

After installing dependencies, to build the tool for CI use, run `npm run build` to create a single runnable `main.js` file.
