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
  
    console.log(`Split ${chunkCount} chunks.`, chunks);
  
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

  for (const line of lines) {
      const trimmedLine = line.trim();

      if (trimmedLine.startsWith('func ')) {
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
  const functions: string[] = [];
  let currentFunction = '';
  let depth = 0;

  for (const line of lines) {
      if (line.trim().startsWith('def ')) {
          depth++;
          if (depth === 1) {
              if (currentFunction) {
                  functions.push(currentFunction);
              }
              currentFunction = line;
          } else {
              currentFunction += '\n' + line;
          }
      } else if (line.trim() === 'end') {
          depth--;
          if (depth === 0) {
              currentFunction += '\n' + line;
              functions.push(currentFunction);
              currentFunction = '';
          } else {
              currentFunction += '\n' + line;
          }
      } else {
          currentFunction += '\n' + line;
      }
  }
  return functions;
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
