import * as path from "path";

import {
    parsePythonFunctions,
    parseRubyFunctions,
    parsePhpFunctions,
    parseVbFunctions,
    parsePerlFunctions,
    parseObjCMethods,
    parseGoFunctions,
} from "./languageParsers";

import { defaultCodeSplitter } from "./languageParsers";
import { splitCodeWithAggregation } from "./splitWithAggregation";
import { languageMappings } from "./languageMappings";

function getFileExtension(filename: string): string {
    const lastIndex = filename.lastIndexOf(".");
    return lastIndex !== -1 ? filename.slice(lastIndex + 1) : "";
}

function getVSCodeLanguageId(filename: string): string {
    let fileExtension = getFileExtension(filename);
    if (fileExtension === "") {
        let parsedFilename = path.parse(filename).name;
        fileExtension = parsedFilename || path.basename(filename);
    }

    return languageMappings[fileExtension] || "plaintext";
}

export function plainTextParser(code: string): [string[], number[]] {
    return [[code], [0]];
}

export function parseFunctions(
    filename: string,
    code: string,
    aggregationEnabled: boolean = false
): [string, string[], number[]] {
    const languageId = getVSCodeLanguageId(filename);
    const parsers: { [key: string]: (code: string) => [string[], number[]] } = {
        python: parsePythonFunctions,
        ruby: parseRubyFunctions,
        php: parsePhpFunctions,
        vb: parseVbFunctions,
        perl: parsePerlFunctions,
        // eslint-disable-next-line @typescript-eslint/naming-convention
        "objective-c": parseObjCMethods,
        go: parseGoFunctions,
        c: defaultCodeSplitter,
        cpp: defaultCodeSplitter,
        javascript: defaultCodeSplitter,
        typescript: defaultCodeSplitter,
        swift: defaultCodeSplitter,
        coffeescript: defaultCodeSplitter,
        plaintext: plainTextParser,
    };

    const selectedParser = parsers[languageId] || defaultCodeSplitter;

    const [parsedCode, lineNumbers] = aggregationEnabled
        ? splitCodeWithAggregation(selectedParser, code)
        : selectedParser(code);

    return [languageId, parsedCode, lineNumbers];
}