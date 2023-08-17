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
import os
import sys
import re

def replace_picture_with_img(match):
    # Grab the content inside <picture>...</picture>
    picture_content = match.group(0)

    # Find the img src inside the <picture> content
    img_match = re.search(r'<img src="([^"]*)"', picture_content)
    if img_match:
        return f'<img src="{img_match.group(1)}">'
    else:
        return ""

# Check if a version argument is provided
if len(sys.argv) < 2:
    print("Usage: ./update-readmes.py <version>")
    print("Example: ./update-readmes.py v0.1.0")
    sys.exit(1)

# Loop through each packages/x folder
for dir_path, dirs, files in os.walk("packages/"):
    # Check if README.md file exists
    if "README.md" in files:
        readme_file = os.path.join(dir_path, "README.md")

        with open(readme_file, 'r+') as file:
            content = file.read()

            # 1. Replace /dara/blob/master/ with /dara/blob/<version>/.
            # This is to ensure that the README.md file always points to the correct tag on GitHub
            new_content = re.sub(r'/dara/blob/master/', f'/dara/blob/{sys.argv[1]}/', content)

            # 2. Replace <picture> tag with <img> tag for PyPI
            # This is because PyPI doesn't support <picture> tags yet
            # Assuming the <picture> tag looks something like this:
            # <picture>
            #   ...
            #   <img src="default">
            # </picture>
            # We want to replace it with:
            # <img src="default">
            new_content = re.sub(r'<picture>.*?</picture>', replace_picture_with_img, new_content, flags=re.DOTALL)

            # If content is changed, write it back to the file
            if new_content != content:
                file.seek(0)
                file.write(new_content)
                file.truncate()

print("Update complete.")
