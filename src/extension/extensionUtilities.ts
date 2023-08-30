
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