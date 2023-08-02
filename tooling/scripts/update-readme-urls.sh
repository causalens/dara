# Loop through each packages/* folder
# For each README.md file, replace all instances of /dara/blob/master/ with /dara/blob/<version>/ where <version> is the argument to the script

# Usage: ./update-readme-urls.sh <version>
# Example: ./update-readme-urls.sh v0.1.0

# Check if a version argument is provided
if [ -z "$1" ]; then
  echo "Usage: ./update-readme-urls.sh <version>"
  echo "Example: ./update-readme-urls.sh v0.1.0"
  exit 1
fi

# Loop through each packages/x folder
for dir in packages/*; do
  if [ -d "$dir" ]; then
    readme_file="$dir/README.md"

    # Check if README.md file exists
    if [ -f "$readme_file" ]; then
      echo "Updating $readme_file"

      # Replace instances based on OS
      if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        sed -i '' "s|/dara/blob/master/|/dara/blob/$1/|g" "$readme_file"
      else
        # Linux
        sed -i "s|/dara/blob/master/|/dara/blob/$1/|g" "$readme_file"
      fi
    fi
  fi
done
