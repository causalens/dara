#!/bin/sh

VENV_PATH=$(poetry env info -p)

echo "Linking .venv folders to ${VENV_PATH}"

for d in packages/* ; do
    echo "Linking .venv in package ${d}"
    cd $d && ln -s $VENV_PATH .venv
    echo ".venv linked in ${d}"
    cd ../..
done

echo ".venv folders linked"
