import fs from "fs/promises";
import path from "path";
import { Glob } from "glob";

// 1. Copyright header - update in every Python file
const LICENSE = `\
"""
Copyright 2023 Impulse Innovations Limited


Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
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

// 2. Copy LICENSE folder to each packages/*/ folder - only in OPEN_SOURCE_FOLDERS
const LICENSE_PATH = "./LICENSE";

const packages = new Glob(
  `./packages/{${Object.keys(OPEN_SOURCE_FOLDERS).join(",")}}/`,
  {
    mark: true,
    magicalBraces: true,
  }
);

for await (const p of packages) {
  const newPath = path.join(p, "LICENSE");
  console.log(`Copying LICENSE to ${newPath}`);
  await fs.copyFile(LICENSE_PATH, newPath);
}
