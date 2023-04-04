#!/bin/bash

for i in {1..20}
do
    npm run test
    if [ $? -ne 0 ]; then
        echo "Test run failed on iteration $i"
        exit 1
    fi
done

echo "All test runs passed."

