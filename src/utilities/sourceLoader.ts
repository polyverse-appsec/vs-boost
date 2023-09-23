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

            // Razor support
        cshtml: "html",

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

        // Salesforce Apex support, we're going to treat as Java for now
        //  but they're really Apex language files (requiring an Apex extension plugin
        //  for Visual Studio Code)
        cls: "java",
        trigger: "java",
        object: "java",
        apex: "java",
        // Salesforce Visualforce support
        component: "html",
        page: "html",
        // Salesforce Lightning support
        soql: "sql",

    };

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