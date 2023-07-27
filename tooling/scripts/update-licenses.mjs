import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { Glob, globIterate } from "glob";

// 1. Copyright header - update in every Python file
const LICENSE = `\
"""
Copyright (c) 2023 by Impulse Innovations Ltd. Part of the causaLens product.

Use of this software is governed by the Business Source License 1.1 included in the file LICENSES/BSL.txt.

As of the Change Date specified in that file, in accordance with the Business Source License 1.1,
use of this software will be governed by the Apache License, Version 2.0, included in the file LICENSES/APL.txt.
"""
`;

const IGNORE_PATHS = [
  "packages/create-dara-app/create_dara_app/templates/**/*.py",
];
const OPEN_SOURCE_FOLDERS = {
  "dara-core": "dara",
  "create-dara-app": "create_dara_app",
  "dara-components": "dara",
};

/**
 * Update copyright for Python files in given folders with the given header
 *
 * @param {Record<string, string>} folders
 * @param {string[]} header
 */
async function updateCopyright(folders, header) {
  const folderPaths = Object.entries(folders).map((entry) => entry.join("/"));
  const files = new Glob(`./packages/{${folderPaths.join(",")}}/**/*.py`, {
    magicalBraces: true,
    ignore: IGNORE_PATHS,
  });

  for await (const file of files) {
    // Read the file
    const content = await fs.readFile(file, "utf8");

    let newContent;

    // check if it starts with a docstring block
    if (content.startsWith('"""')) {
      console.log(`Updating license in ${file}`);
      // check how many lines the block takes
      const lines = content.split("\n");
      const end =
        lines.slice(1).findIndex((line) => line.startsWith('"""')) + 1;
      // remove the docstring from the content
      lines.splice(0, end + 1);
      newContent = header + lines.join("\n");
    } else {
      console.log(`Adding license to ${file}`);
      // Update the content
      newContent = header + content;
    }

    // Write the file
    await fs.writeFile(file, newContent, "utf8");
  }
}

await updateCopyright(OPEN_SOURCE_FOLDERS, LICENSE);

// 2. Copy LICENSES/ folder to each packages/*/ folder - only in OPEN_SOURCE_FOLDERS
const LICENSES_PATH = "./LICENSES";
const licensesIter = globIterate(`${LICENSES_PATH}/*`);
const licenses = [];
for await (const license of licensesIter) {
  licenses.push(license);
}
console.log("Discovered licenses: ", licenses);

const packages = new Glob(
  `./packages/{${Object.keys(OPEN_SOURCE_FOLDERS).join(",")}}/`,
  {
    mark: true,
    magicalBraces: true,
  }
);

for await (const p of packages) {
  // If LICENSES does not exist in that folder, create empty first
  if (!fsSync.existsSync(path.join(p, "LICENSES"))) {
    await fs.mkdir(`${p}/LICENSES`);
  }

  for (const license of licenses) {
    const newPath = path.join(p, "LICENSES", license.split("/").pop());
    console.log(`Copying ${license} to ${newPath}`);
    await fs.copyFile(license, newPath);
  }
}
