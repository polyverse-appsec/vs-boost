function splitCode(code: string): string[] {
    const chunks: string[] = [];
    const lines = code.split('\n');
    let currentChunk = '';
    let chunkCount = 0;
    let nestingCount = 0;
    let inNest = false;
  
    for (const line of lines) {
      currentChunk += line + '\n';
  
      if (currentChunk.split(' ').length > 2000 || currentChunk.length > 4000) {
        chunks.push(currentChunk);
        currentChunk = '';
        chunkCount++;
      }
  
      if (line.includes('{')) {
        nestingCount++;
        inNest = true;
      }
  
      if (line.includes('}')) {
        nestingCount--;
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
