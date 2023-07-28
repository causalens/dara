#!/bin/bash

VERSION=$(grep 'version =' ./pyproject.toml | sed 's/version[[:space:]]=[[:space:]]//' | sed 's/"//g')
sed -i -e "s/0.0.0/$VERSION/g" $1
