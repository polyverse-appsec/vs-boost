import * as path from "path";
import { getEncoding } from "js-tiktoken";

type CodeParser = (code: string) => [string[], number[]];

const enc = getEncoding("cl100k_base");
const maxTokenAggregationLength = 2500;

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

    const languageMappings: { [key: string]: string } = {
        js: "javascript",
        ts: "typescript",
        coffee: "coffeescript",
        html: "html",
        vue: "html",
        css: "css",
        json: "json",
        xml: "xml",
        xsl: "xml",
        xslt: "xml",
        md: "markdown",
        py: "python",
        c: "c",
        cpp: "cpp",
        h: "c",
        hpp: "cpp",
        cs: "csharp",
        java: "java",
        go: "go",
        rb: "ruby",
        php: "php",
        swift: "swift",
        kt: "kotlin",
        m: "objective-c",
        ps1: "powershell",
        pl: "perl",
        pm: "perl",
        pod: "perl",
        groovy: "groovy",
        lua: "lua",
        rs: "rust",
        sh: "shellscript",
        bash: "shellscript",
        r: "r",
        yml: "yaml",
        yaml: "yaml",
        fs: "fsharp",
        fsx: "fsharp",
        vb: "vb",
        txt: "plaintext",
        sql: "sql",
        gradle: "plaintext",
        csproj: "plaintext",
        vbproj: "plaintext",
        fsproj: "plaintext",
        sln: "plaintext",
        toml: "plaintext",
        xcodeproj: "plaintext",
        rakefile: "plaintext",
        makefile: "plaintext",
    };

    return languageMappings[fileExtension] || "plaintext";
}

export function parseFunctions(
    filename: string,
    code: string
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
    };

    const cStyleLanguages = new Set([
        "c",
        "cpp",
        "javascript",
        "typescript",
        "swift",
        "coffeescript",
    ]);

    const parser = cStyleLanguages.has(languageId)
        ? splitCodeWithoutAggregation
        : parsers[languageId];

    // if we have a known parser, use it
    if (parser) {
        const [parsedCode, lineNumbers] = splitCode(parser, code);
        return [languageId, parsedCode, lineNumbers];
        // if the language is unknown, treat it as plaintext, and don't parse it
        //  send one big chunk and presume its small enough to be processed
    } else if (languageId === "plaintext") {
        return [languageId, [code], [0]];
        // otherwise split the code based on default bracket parsing
    } else {
        const [splitCodeResult, lineNumbers] = splitCode(
            splitCodeWithoutAggregation,
            code
        );
        return [languageId, splitCodeResult, lineNumbers];
    }
}

function splitCode(
    disaggregatedCodeSplitter: CodeParser,
    code: string
): [string[], number[]] {
    const splitResults: [string[], number[]] = disaggregatedCodeSplitter(code);

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
            newSplitResults[0].push(currentString);
            newSplitResults[1].push(currentLineNumber);

            currentString = originalString;
            currentLineNumber = originalLineNumber;

            const currentStringTokenCount = enc.encode(currentString).length;
            if (currentStringTokenCount > maxTokenAggregationLength) {
                newSplitResults[0].push(currentString);
                newSplitResults[1].push(originalLineNumber);
                currentString = "";
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

function splitCodeWithoutAggregation(code: string): [string[], number[]] {
    const chunks: string[] = [];
    const lineNumbers: number[] = [];
    const lines = code.split("\n");
    let currentChunk = "";
    let chunkStartLine = 0; // this will track the line number where each chunk starts
    let nestingCount = 0;
    let inNest = false;

    for (let lineno = 0; lineno < lines.length; lineno++) {
        const line = lines[lineno];
        currentChunk += line + "\n";

        const leftBraces = (line.match(/{/g) || []).length;
        const rightBraces = (line.match(/}/g) || []).length;

        if (leftBraces > 0) {
            nestingCount += leftBraces;

            if (!inNest) {
                chunkStartLine = lineno; // a new chunk is starting here
                inNest = true;
            }
        }

        if (rightBraces > 0) {
            nestingCount -= rightBraces;
        }

        if (nestingCount === 0 && currentChunk.trim() !== "" && inNest) {
            chunks.push(currentChunk);
            lineNumbers.push(chunkStartLine);
            currentChunk = "";
            inNest = false;
        }
    }

    // add the final chunk if it exists
    if (currentChunk.trim() !== "") {
        chunks.push(currentChunk);
        lineNumbers.push(chunkStartLine);
    }

    return [chunks, lineNumbers];
}

function parseBracketyLanguage(
    code: string,
    functionName: string
): [string[], number[]] {
    const lines = code.split("\n");
    const functions: string[] = [];
    const lineNumbers: number[] = [];
    let currentFunction = "";
    let depth = 0;
    let inFunction = false;
    let startLineNumber = 0;

    for (let lineNumber = 0; lineNumber < lines.length; lineNumber++) {
        const line = lines[lineNumber];
        const trimmedLine = line.trim();

        if (trimmedLine.startsWith(functionName + " ")) {
            if (!inFunction && depth === 0) {
                inFunction = true;
                startLineNumber = lineNumber + 1; // store the line number where the function starts
                currentFunction += line;
            } else if (inFunction) {
                currentFunction += "\n" + line;
            }
        } else if (inFunction) {
            currentFunction += "\n" + line;
        }

        // Count opening and closing braces to track the depth
        for (const char of trimmedLine) {
            if (char === "{") {
                depth++;
            } else if (char === "}") {
                depth--;
            }
        }

        // If depth is 0 and we are in a function, push the currentFunction and its start line number and reset it
        if (depth === 0 && inFunction) {
            if (currentFunction.trim() !== "") {
                functions.push(currentFunction);
                lineNumbers.push(startLineNumber);
                currentFunction = "";
                inFunction = false;
            }
        }
    }

    // Push any remaining function and its start line number
    if (inFunction && currentFunction.trim() !== "") {
        functions.push(currentFunction);
        lineNumbers.push(startLineNumber);
    }

    return [functions, lineNumbers];
}

function parsePerlFunctions(code: string): [string[], number[]] {
    const [functions, lineNumbers] = parseBracketyLanguage(code, "sub");
    return [functions, lineNumbers];
}

function parsePhpFunctions(code: string): [string[], number[]] {
    const [functions, lineNumbers] = parseBracketyLanguage(code, "function");
    return [functions, lineNumbers];
}
function parseGoFunctions(code: string): [string[], number[]] {
    const [functions, lineNumbers] = parseBracketyLanguage(code, "func");
    return [functions, lineNumbers];
}

function parseVbFunctions(code: string): [string[], number[]] {
    const lines = code.split("\n");
    const functions: string[] = [];
    const lineNumbers: number[] = [];
    let currentFunction = "";
    let depth = 0;
    let functionStartLine = 0;

    for (let lineno = 0; lineno < lines.length; lineno++) {
        const line = lines[lineno];
        const trimmedLine = line.trim();

        if (
            trimmedLine.startsWith("Function") ||
            trimmedLine.startsWith("Sub")
        ) {
            depth++;
            if (depth === 1) {
                if (currentFunction) {
                    functions.push(currentFunction);
                    lineNumbers.push(functionStartLine);
                }
                currentFunction = line;
                functionStartLine = lineno; // new function starts here
            } else {
                currentFunction += "\n" + line;
            }
        } else if (
            trimmedLine.startsWith("End Function") ||
            trimmedLine.startsWith("End Sub")
        ) {
            depth--;
            currentFunction += "\n" + line;
            if (depth === 0) {
                functions.push(currentFunction);
                lineNumbers.push(functionStartLine);
                currentFunction = "";
            }
        } else {
            currentFunction += "\n" + line;
        }
    }
    if (currentFunction) {
        functions.push(currentFunction);
        lineNumbers.push(functionStartLine);
    }
    return [functions, lineNumbers];
}

function parseObjCMethods(code: string): [string[], number[]] {
    const lines = code.split("\n");
    const methods: string[] = [];
    const lineNumbers: number[] = [];
    let currentMethod = "";
    let depth = 0;
    let insideImplementation = false;
    let methodStartLine = 0;

    for (let lineno = 0; lineno < lines.length; lineno++) {
        const line = lines[lineno];
        const trimmedLine = line.trim();

        if (trimmedLine.startsWith("@implementation")) {
            insideImplementation = true;
            if (currentMethod) {
                methods.push(currentMethod);
                lineNumbers.push(methodStartLine);
            }
            currentMethod = line;
            methodStartLine = lineno;
        } else if (trimmedLine.startsWith("@end")) {
            insideImplementation = false;
            currentMethod += "\n" + line;
            methods.push(currentMethod);
            lineNumbers.push(methodStartLine);
            currentMethod = "";
        } else if (insideImplementation) {
            if (trimmedLine.startsWith("-") && depth === 0) {
                if (currentMethod) {
                    methods.push(currentMethod);
                    lineNumbers.push(methodStartLine);
                }
                methodStartLine = lineno;
            }
            currentMethod += "\n" + line;
            if (line.includes("{")) {
                depth++;
            } else if (line.includes("}")) {
                depth--;
            }
        } else {
            currentMethod += "\n" + line;
        }
    }
    if (currentMethod) {
        methods.push(currentMethod);
        lineNumbers.push(methodStartLine);
    }
    return [methods, lineNumbers];
}

function parseRubyFunctions(code: string): [string[], number[]] {
    const lines = code.split("\n");
    const blocks: string[] = [];
    const lineNumbers: number[] = [];
    let currentBlock = "";
    let depth = 0;
    let blockStartLine = 0;

    const blockStartKeywords =
        /^(def|class|module|if|elsif|unless|while|until|for|case|begin|do)\b/;
    const blockEndKeyword = /^end\b/;

    for (let lineno = 0; lineno < lines.length; lineno++) {
        const line = lines[lineno];
        const trimmedLine = line.trim();
        if (blockStartKeywords.test(trimmedLine)) {
            depth++;
            if (depth === 1) {
                if (currentBlock) {
                    blocks.push(currentBlock);
                    lineNumbers.push(blockStartLine);
                }
                currentBlock = line;
                blockStartLine = lineno;
            } else {
                currentBlock += "\n" + line;
            }
        } else if (blockEndKeyword.test(trimmedLine)) {
            depth--;
            if (depth === 0) {
                currentBlock += "\n" + line;
                blocks.push(currentBlock);
                lineNumbers.push(blockStartLine);
                currentBlock = "";
            } else {
                currentBlock += "\n" + line;
            }
        } else {
            currentBlock += "\n" + line;
        }
    }

    if (currentBlock) {
        blocks.push(currentBlock);
        lineNumbers.push(blockStartLine);
    }

    return [blocks, lineNumbers];
}

function parsePythonFunctions(code: string): [string[], number[]] {
    const lines = code.split("\n");
    const functions: string[] = [];
    const lineNumbers: number[] = [];
    let currentFunction = "";
    let functionStartLine = 0;

    for (let lineno = 0; lineno < lines.length; lineno++) {
        const line = lines[lineno];
        if (line.trim().startsWith("def ")) {
            if (currentFunction) {
                functions.push(currentFunction);
                lineNumbers.push(functionStartLine);
            }
            currentFunction = line;
            functionStartLine = lineno;
        } else {
            currentFunction += "\n" + line;
        }
    }

    if (currentFunction) {
        functions.push(currentFunction);
        lineNumbers.push(functionStartLine);
    }

    return [functions, lineNumbers];
}
