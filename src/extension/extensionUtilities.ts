
import { getCurrentDateTime } from "../utilities/datetime";

export function getKernelName(kernelName: string): string {
    return "polyverse-boost-" + kernelName + "-kernel";
}

export function cleanCellOutput(input: string): string {
    // strip out timestamps from the input
    // ### Boost Code Compliance Check Summary
    // Last Updated: Friday, June 16, 2023 at 8:24:17 PM PDT

    // use regex to remove the above info
    var pattern = /\n\n---\n\n### Boost [^\n]*\n\nLast Updated: [^\n]*\n\n/g;
    const cleanedInput = input.replace(pattern, "");
    return cleanedInput;
}

export function generateCellOutputWithHeader(
    analysisType: string,
    analysisResults: string
): string {
    return `\n\n---\n\n### Boost ${analysisType}\n\nLast Updated: ${getCurrentDateTime()}\n\n${analysisResults}`;
}

// Function to calculate the total count of objects
export function totalElements(arr: any[]) {
    return arr.reduce((acc, curr) => {
        if (Array.isArray(curr)) {
            // If it's an array, sum the elements in it
            return acc + curr.reduce((subAcc, subCurr) => subAcc + (Array.isArray(subCurr)?0:1), 0);
        } else {
            // If it's an object, count it
            return acc + 1;
        }
    }, 0);
}
