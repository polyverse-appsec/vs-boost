const OPENAI_API_PARAMETER_PAYLOAD_MAX = 4000;

function splitCode(code: string): string[] {
  const chunks: string[] = [];
  const lines = code.split('\n');
  let lineno = 0;
  let currentChunk = '';
  let chunkCount = 0;
  let nestingCount = 0;
  let inNest = false;

  for (const line of lines) {
    currentChunk += line + '\n';
    lineno++; // for debugging purposes only - to see what line we are parsing

    // do a sanity check to see if there are more than 2000 space delimited tokens
    //    in this source chunk. If so, we call that a parsing limit and break the chunk
    // Or if the overall chunk is greater than 4000 characters, we break it up.
    // This sanity check is due to OpenAI not accepting payloads at the API level
    //    larger than 4000 characters

    // for future improvement (maybe soon?), we should rejoin the chunks, then
    //     come up with a simple shorthand version to show in the cell (e.g. function foo() { ... })
    //     and then explain the function or content is beyond the limits of current support
    //     so the function cannot be explained, parsed or refactored
    if (currentChunk.split(' ').length > (OPENAI_API_PARAMETER_PAYLOAD_MAX / 2) ||
        currentChunk.length > OPENAI_API_PARAMETER_PAYLOAD_MAX) {
      chunks.push(currentChunk);
      currentChunk = '';
      chunkCount++;
    }

    const leftBraces = (line.match(/{/g) || []).length;
    const rightBraces = (line.match(/}/g) || []).length;

    if (leftBraces > 0) {
      nestingCount += leftBraces;

      inNest = true;
    }

    if (rightBraces > 0) {
      nestingCount -= rightBraces;
    }

    if (nestingCount === 0 && currentChunk !== '' && inNest) {
      chunks.push(currentChunk);
      currentChunk = '';
      chunkCount++;
      inNest = false;
    }
  }

  if (currentChunk.trim() !== '' && currentChunk !== '') {
    chunks.push(currentChunk);
    chunkCount++;
  }

  return chunks;
}

  
  function getFileExtension(filename: string): string {
    const lastIndex = filename.lastIndexOf(".");
    return lastIndex !== -1 ? filename.slice(lastIndex + 1) : "";
}

function getVSCodeLanguageId(filename: string): string {
    const fileExtension = getFileExtension(filename);

    const languageMappings: { [key: string]: string } = {
        "js": "javascript",
        "ts": "typescript",
        "html": "html",
        "css": "css",
        "json": "json",
        "xml": "xml",
        "md": "markdown",
        "py": "python",
        "c": "c",
        "cpp": "cpp",
        "cs": "csharp",
        "java": "java",
        "go": "go",
        "rb": "ruby",
        "php": "php",
        "swift": "swift",
        "kt": "kotlin",
        "m": "objective-c",
        "ps1": "powershell",
        "pl": "perl",
        "groovy": "groovy",
        "lua": "lua",
        "rs": "rust",
        "sh": "shellscript",
        "bash": "shellscript",
        "r": "r",
        "yml": "yaml",
        "yaml": "yaml",
        "fs": "fsharp",
        "fsx": "fsharp",
        "vb": "vb"
    };

    return languageMappings[fileExtension] || "unknown";
}

type CodeParser = (code: string) => string[];

export function parseFunctions(filename: string, code: string): [string, string[]] {
    const languageId = getVSCodeLanguageId(filename);
    const parsers: { [key: string]: CodeParser } = {
        "python": parsePythonFunctions,
        "ruby": parseRubyFunctions,
        "php": parsePhpFunctions,
        "vb": parseVbFunctions,
				// eslint-disable-next-line @typescript-eslint/naming-convention
        "objective-c": parseObjCMethods,
        "go": parseGoFunctions,
    };

    const cStyleLanguages = new Set([
        "c",
        "cpp",
        "javascript",
        "typescript",
        "swift",
    ]);

    const parser = cStyleLanguages.has(languageId)
        ? splitCode
        : parsers[languageId];

    if (parser) {
        return [languageId, parser(code)];
    } else {
        return [languageId, splitCode(code)];
    }
}

function parsePhpFunctions(code: string): string[] {
  const lines = code.split('\n');
  const functions: string[] = [];
  let currentFunction = '';
  let depth = 0;

  for (const line of lines) {
      const trimmedLine = line.trim();

      if (trimmedLine.startsWith('function ')) {
          depth++;
          if (depth === 1) {
              if (currentFunction) {
                  functions.push(currentFunction);
              }
              currentFunction = line;
          } else {
              currentFunction += '\n' + line;
          }
      } else if (trimmedLine.endsWith('}')) {
          depth--;
          currentFunction += '\n' + line;
          if (depth === 0) {
              functions.push(currentFunction);
              currentFunction = '';
          }
      } else {
          currentFunction += '\n' + line;
      }
  }
  if (currentFunction) {
      functions.push(currentFunction);
  }
  return functions;
}

function parseVbFunctions(code: string): string[] {
  const lines = code.split('\n');
  const functions: string[] = [];
  let currentFunction = '';
  let depth = 0;

  for (const line of lines) {
      const trimmedLine = line.trim();

      if (trimmedLine.startsWith('Function') || trimmedLine.startsWith('Sub')) {
          depth++;
          if (depth === 1) {
              if (currentFunction) {
                  functions.push(currentFunction);
              }
              currentFunction = line;
          } else {
              currentFunction += '\n' + line;
          }
      } else if (trimmedLine.startsWith('End Function') || trimmedLine.startsWith('End Sub')) {
          depth--;
          currentFunction += '\n' + line;
          if (depth === 0) {
              functions.push(currentFunction);
              currentFunction = '';
          }
      } else {
          currentFunction += '\n' + line;
      }
  }
  if (currentFunction) {
      functions.push(currentFunction);
  }
  return functions;
}

function parseGoFunctions(code: string): string[] {
  const lines = code.split('\n');
  const functions: string[] = [];
  let currentFunction = '';
  let depth = 0;
  let inFunction = false;

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (trimmedLine.startsWith('func ')) {
      if (!inFunction) {
        inFunction = true;
        if (currentFunction) {
          functions.push(currentFunction);
        }
        currentFunction = line;
      } else {
        currentFunction += '\n' + line;
      }
    } else {
      currentFunction += '\n' + line;
    }

    // Count opening and closing braces to track the depth
    for (const char of trimmedLine) {
      if (char === '{') {
        depth++;
      } else if (char === '}') {
        depth--;
      }
    }

    // If depth is 0 and we are in a function, push the currentFunction and reset it
    if (depth === 0 && inFunction) {
      functions.push(currentFunction);
      currentFunction = '';
      inFunction = false;
    }
  }

  if (currentFunction) {
    functions.push(currentFunction);
  }

  return functions;
}


function parseObjCMethods(code: string): string[] {
  const lines = code.split('\n');
  const methods: string[] = [];
  let currentMethod = '';
  let depth = 0;
  let insideImplementation = false;

  for (const line of lines) {
      const trimmedLine = line.trim();

      if (trimmedLine.startsWith('@implementation')) {
          insideImplementation = true;
          if (currentMethod) {
              methods.push(currentMethod);
              currentMethod = '';
          }
          currentMethod += line;
      } else if (trimmedLine.startsWith('@end')) {
          insideImplementation = false;
          currentMethod += '\n' + line;
          methods.push(currentMethod);
          currentMethod = '';
      } else if (insideImplementation) {
          if (trimmedLine.startsWith('-') && depth === 0) {
              if (currentMethod) {
                  methods.push(currentMethod);
                  currentMethod = '';
              }
          }
          currentMethod += '\n' + line;
          if (line.includes('{')) {
              depth++;
          } else if (line.includes('}')) {
              depth--;
          }
      } else {
          currentMethod += '\n' + line;
      }
  }
  if (currentMethod) {
      methods.push(currentMethod);
  }
  return methods;
}

function parseRubyFunctions(code: string): string[] {
  const lines = code.split('\n');
  const blocks: string[] = [];
  let currentBlock = '';
  let depth = 0;

  const blockStartKeywords = /^(def|class|module|if|elsif|unless|while|until|for|case|begin|do)\b/;
  const blockEndKeyword = /^end\b/;

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (blockStartKeywords.test(trimmedLine)) {
      depth++;
      if (depth === 1) {
        if (currentBlock) {
          blocks.push(currentBlock);
        }
        currentBlock = line;
      } else {
        currentBlock += '\n' + line;
      }
    } else if (blockEndKeyword.test(trimmedLine)) {
      depth--;
      if (depth === 0) {
        currentBlock += '\n' + line;
        blocks.push(currentBlock);
        currentBlock = '';
      } else {
        currentBlock += '\n' + line;
      }
    } else {
      currentBlock += '\n' + line;
    }
  }
  // If currentBlock is not empty, it means that the code does not end with 'end', add it to the blocks
  if (currentBlock) {
    blocks.push(currentBlock);
  }

  return blocks;
}


function parsePythonFunctions(code: string): string[] {
  const lines = code.split('\n');
  const functions: string[] = [];
  let currentFunction = '';

  for (const line of lines) {
      if (line.trim().startsWith('def ')) {
          if (currentFunction) {
              functions.push(currentFunction);
          }
          currentFunction = line;
      } else {
          currentFunction += '\n' + line;
      }
  }
  if (currentFunction) {
      functions.push(currentFunction);
  }
  return functions;
}
