#!/bin/bash

# Check if the user has provided a filename
if [ -z "$1" ]; then
  echo "Please provide a filename as an input parameter."
  exit 1
fi

# Read the contents of the file and escape special characters
contents=$(cat "$1" | sed 's/$/\\n/' | tr -d '\n' | sed 's/\\#/\\\\#/g')
# contents=$(cat $1 | sed 's/\\/\\\\/g; s/"/\\"/g; s/\//\\\//g; s/\n/\\n/g')

# Output the escaped contents as a single line string to the console
echo '{'
echo -n '   "markdown" : "' && echo -n "$contents" | tr -d '\n' && echo '"'
echo -n '}'

