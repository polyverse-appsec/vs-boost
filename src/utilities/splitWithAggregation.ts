import { getEncoding } from "js-tiktoken";

type CodeParser = (code: string) => [string[], number[]];

const enc = getEncoding("cl100k_base");
const maxTokenAggregationLength = 2500;


export function splitCodeWithAggregation(
    splitCode: CodeParser,
    code: string
): [string[], number[]] {
    const splitResults: [string[], number[]] = splitCode(code);

    const [originalStrings, lineNumbers] = splitResults;

    const newSplitResults: [string[], number[]] = [[], []];
    let currentString = "";
    let currentLineNumber = 0; // Initialize with 0

    for (let i = 0; i < originalStrings.length; i++) {
        const originalString = originalStrings[i];
        const originalLineNumber = lineNumbers[i];
        const aggregatedString = currentString
            ? currentString + "\n" + originalString
            : originalString;

        const tokenCount = enc.encode(aggregatedString).length;
        if (tokenCount <= maxTokenAggregationLength) {
            if (currentString === "") {
                currentLineNumber = originalLineNumber; // Update current line number for the first string
            }
            currentString = aggregatedString;
        } else {
            if (currentString) {
                newSplitResults[0].push(currentString);
                newSplitResults[1].push(currentLineNumber);
            }

            currentString = originalString;
            currentLineNumber = originalLineNumber;

            const currentStringTokenCount = enc.encode(currentString).length;
            if (currentStringTokenCount > maxTokenAggregationLength) {
                if (currentString) {
                    newSplitResults[0].push(currentString);
                    newSplitResults[1].push(currentLineNumber);
                    currentString = "";
                }
                currentLineNumber = originalLineNumber;
            }
        }
    }

    if (currentString) {
        newSplitResults[0].push(currentString);
        newSplitResults[1].push(currentLineNumber);
    }

    return newSplitResults;
}
