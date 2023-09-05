#!/bin/bash

# Validate input argument
if [ -z "$1" ]
then
  echo "Missing organization parameter." >&2
  exit 1
fi

# Combine the organization name
org="BoostCustomer-$1"

# Run VS Code command
code --command "polyverse-boost-notebook.setOrganization ${org}"

# Capture the exit code
exit_code=$?

# Check the exit code and print an error message if necessary
if [ $exit_code -ne 0 ]
then
  echo "Failed to execute the VS Code command. Error code: $exit_code" >&2
fi

# Exit with the same code
exit $exit_code
