const useNewParser = false;

export function splitCode(code: string): [string[], number[]] {
    if (useNewParser) {
        return parseCode("javascript", code);
    }

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
                inNest = true;
            }
        }

        if (rightBraces > 0) {
            nestingCount -= rightBraces;
            if (nestingCount < 0) {
                nestingCount = 0; // reset to 0 when it becomes negative
            }
        }

        if (nestingCount === 0 && currentChunk.trim() !== "" && inNest) {
            chunks.push(currentChunk);
            lineNumbers.push(chunkStartLine + 1);
            chunkStartLine = lineno + 1;
            currentChunk = "";
            inNest = false;
        }
    }

    // add the final chunk if it exists
    if (currentChunk.trim() !== "") {
        chunks.push(currentChunk.slice(0, -1)); // remove the last newline
        lineNumbers.push(chunkStartLine + 1);
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
            }
            currentFunction += line + "\n";
        } else if (inFunction) {
            currentFunction += line + "\n";
        }

        // Count opening and closing braces to track the depth
        for (const char of trimmedLine) {
            if (char === "{") {
                depth++;
            } else if (char === "}") {
                depth--;
                if (depth === 0 && inFunction) {
                    if (currentFunction !== "") {
                        functions.push(currentFunction);
                        lineNumbers.push(startLineNumber + 1);
                        startLineNumber = lineNumber + 1;
                        currentFunction = "";
                        inFunction = false;
                    }
                }
            }
        }
    }

    // Push any remaining function and its start line number
    if (inFunction && currentFunction !== "") {
        functions.push(currentFunction.slice(0, -1)); // remove the last newline
        lineNumbers.push(startLineNumber + 1);
    }

    return [functions, lineNumbers];
}

export function parsePerlFunctions(code: string): [string[], number[]] {
    const [functions, lineNumbers] = parseBracketyLanguage(code, "sub");
    return [functions, lineNumbers];
}

export function parsePhpFunctions(code: string): [string[], number[]] {
    const [functions, lineNumbers] = parseBracketyLanguage(code, "function");
    return [functions, lineNumbers];
}

export function parseGoFunctions(code: string): [string[], number[]] {
    const [functions, lineNumbers] = parseBracketyLanguage(code, "func");
    return [functions, lineNumbers];
}

export function parseVbFunctions(code: string): [string[], number[]] {
    if (useNewParser) {
        return parseCode("vb", code);
    }
    
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
                    lineNumbers.push(functionStartLine + 1);
                    functionStartLine = lineno + 1;
                }
                currentFunction = line;
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
                lineNumbers.push(functionStartLine + 1);
                functionStartLine = lineno + 1;
                currentFunction = "";
            }
        } else {
            currentFunction += "\n" + line;
        }
    }
    if (currentFunction) {
        functions.push(currentFunction.slice(0, -1)); // remove the last newline
        lineNumbers.push(functionStartLine + 1);
    }
    return [functions, lineNumbers];
}

export function parseObjCMethods(code: string): [string[], number[]] {
    if (useNewParser) {
        return parseCode("objective-c", code);
    }

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
                lineNumbers.push(methodStartLine + 1);
                methodStartLine = lineno + 1;
            }
            currentMethod = line;
        } else if (trimmedLine.startsWith("@end")) {
            insideImplementation = false;
            currentMethod += "\n" + line;
            methods.push(currentMethod);
            lineNumbers.push(methodStartLine + 1);
            methodStartLine = lineno + 1;
            currentMethod = "";
        } else if (insideImplementation) {
            if (trimmedLine.startsWith("-") && depth === 0) {
                if (currentMethod) {
                    methods.push(currentMethod);
                    lineNumbers.push(methodStartLine + 1);
                    methodStartLine = lineno + 1;
                }
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
        methods.push(currentMethod.slice(0, -1)); // remove the last newline
        lineNumbers.push(methodStartLine + 1);
    }
    return [methods, lineNumbers];
}

export function parseRubyFunctions(code: string): [string[], number[]] {
    if (useNewParser) {
        return parseCode("ruby", code);
    }

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
                    lineNumbers.push(blockStartLine + 1);
                    blockStartLine = lineno + 1;
                }
                currentBlock = line;
            } else {
                currentBlock += "\n" + line;
            }
        } else if (blockEndKeyword.test(trimmedLine)) {
            depth--;
            if (depth === 0) {
                currentBlock += "\n" + line;
                blocks.push(currentBlock);
                lineNumbers.push(blockStartLine + 1);
                blockStartLine = lineno + 1;
                currentBlock = "";
            } else {
                currentBlock += "\n" + line;
            }
        } else {
            currentBlock += "\n" + line;
        }
    }

    if (currentBlock) {
        blocks.push(currentBlock.slice(0, -1)); // remove the last newline
        lineNumbers.push(blockStartLine + 1);
    }

    return [blocks, lineNumbers];
}

const useNewParserForPython = true;

export function parsePythonFunctions(code: string): [string[], number[]] {
    if (useNewParser || useNewParserForPython) {
        return parseCode("python", code);
    }

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
                lineNumbers.push(functionStartLine + 1);
                functionStartLine = lineno + 1;
            }
            currentFunction = line;
        } else {
            currentFunction += "\n" + line;
        }
    }

    if (currentFunction) {
        functions.push(currentFunction.slice(0, -1));
        lineNumbers.push(functionStartLine + 1);
    }

    return [functions, lineNumbers];
}


interface LanguageConfig {
    startKeywords: string[];
    endKeywords: string[];
    braceBased: boolean;
    indentationBased?: boolean;
}

const languageConfigs: Record<string, LanguageConfig> = {
    javascript: { startKeywords: [], endKeywords: [], braceBased: true },
    vb: {
        startKeywords: ["Function", "Sub"],
        endKeywords: ["End Function", "End Sub"],
        braceBased: false,
    },
    objc: {
        startKeywords: ["@implementation", "-"],
        endKeywords: ["@end"],
        braceBased: true,
    },
    ruby: {
        startKeywords: [
            "def",
            "class",
            "module",
            "if",
            "elsif",
            "unless",
            "while",
            "until",
            "for",
            "case",
            "begin",
            "do",
        ],
        endKeywords: ["end"],
        braceBased: false,
    },
    python: {
        startKeywords: ["def"],
        endKeywords: [],
        braceBased: false,
        indentationBased: true,
    },
};

export function parseCode(
    language: string,
    code: string,
    functionName?: string
): [string[], number[]] {
    const chunks: string[] = [];
    const lineNumbers: number[] = [];
    const lines = code.split("\n");
    let currentChunk = "";
    let chunkStartLine = 0;
    let nestingCount = 0;
    let inNest = false;
    const config = languageConfigs[language];
    let currentIndentation = 0;

    for (let lineno = 0; lineno < lines.length; lineno++) {
        const line = lines[lineno];
        const trimmedLine = line.trim();
        currentChunk += line + "\n";

        if (config.indentationBased) {
            const indentation = line.search(/\S/);
            if (config.startKeywords.some((keyword) =>
                    trimmedLine.startsWith(keyword)) && !inNest) {
                inNest = true;
                nestingCount++;
                currentIndentation = indentation;
            } else if (
                indentation <= currentIndentation &&
                inNest &&
                !config.startKeywords.some((keyword) =>
                trimmedLine.startsWith(keyword))
            )
            {
                nestingCount--;
            }
        } else {
            if (config.braceBased) {
                const leftBraces = (line.match(/{/g) || []).length;
                const rightBraces = (line.match(/}/g) || []).length;

                if (leftBraces > 0) {
                    nestingCount += leftBraces;
                    if (!inNest && (!functionName || line.includes(functionName + ' '))) {
                        inNest = true;
                    }
                }
                if (rightBraces > 0) {
                    nestingCount -= rightBraces;
                }
            } else {
                if (
                    config.startKeywords.some((keyword) =>
                        trimmedLine.startsWith(keyword)
                    )
                ) {
                    nestingCount++;
                }
                if (
                    config.endKeywords.some((keyword) =>
                        trimmedLine.startsWith(keyword)
                    )
                ) {
                    nestingCount--;
                }
            }
        }

        if (nestingCount < 0) {
            nestingCount = 0;
        }
        if (nestingCount === 0 && currentChunk.trim() !== "" && inNest) {
            if (config.indentationBased) {
                chunks.push(currentChunk.slice(0, -1));
            } else {
                chunks.push(currentChunk);
            }
            lineNumbers.push(chunkStartLine + 1);
            chunkStartLine = lineno + 1;
            if (config.indentationBased) {
                currentChunk = "\n";
            } else {
                currentChunk = "";
            }
            inNest = false;
        }
    }

    // add the final chunk if it exists
    if (currentChunk.trim() !== "") {
        chunks.push(currentChunk.trim());
        lineNumbers.push(chunkStartLine + 1);
    }

    return [chunks, lineNumbers];
}
