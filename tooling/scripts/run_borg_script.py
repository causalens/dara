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
import tomli
import os
import sys

# Iterate over pyproject.toml file in packages/<package_name>/pyproject.toml
# and find the [tool.borg.scripts] section
# Then run the script provided as the argument
# The script is run in the context of the package
# Example
# [tool.borg.scripts]
# package = "poetry build -f wheel"

if __name__ == '__main__':
    script_name = sys.argv[1]

    # Iterate over pyproject.toml files
    root = os.getcwd()
    for directory in os.listdir('packages'):
        if directory.startswith('.'):
            continue

        pyproject_path = os.path.join(root, 'packages', directory, 'pyproject.toml')
        print(f'### Looking for {script_name} in {pyproject_path}...', flush=True)
        if os.path.exists(pyproject_path):
            with open(pyproject_path, 'rb') as f:
                pyproject = tomli.load(f)
                if 'tool' in pyproject and 'borg' in pyproject['tool'] and 'scripts' in pyproject['tool']['borg']:
                    scripts = pyproject['tool']['borg']['scripts']
                    if script_name in scripts:
                        script = scripts[script_name]
                        os.chdir(os.path.join(root, 'packages', directory))
                        print(f'### Running {script} in {os.getcwd()}...', flush=True)
                        ret_code = os.system(script)
                        os.chdir('../../')

                        if ret_code != 0:
                            print(
                                f'### Script {script} in {os.path.join(root, directory)} failed with return code {ret_code}',
                                flush=True,
                            )
                            sys.exit(1)
                    else:
                        print(f'### Script {script_name} not found in {pyproject_path}', flush=True)
