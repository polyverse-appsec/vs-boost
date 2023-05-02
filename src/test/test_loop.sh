#!/bin/bash

iterations=${1:-20}
echo "Running $iterations test iterations"

for ((i=1; i<=$iterations; i++))
do
npm run test
if [ $? -ne 0 ]; then
echo "Test run failed on iteration $i"
exit 1
fi
done

echo "All test runs passed."