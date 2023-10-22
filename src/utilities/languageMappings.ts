
export const languageMappings: { [key: string]: string } = {
    js: "javascript",
    ts: "typescript",
    coffee: "coffeescript",
    html: "html",
    vue: "html",

    // Razor support
    cshtml: "html",

    // React support
    jsx: "javascript",
    tsx: "typescript",

    // Cobol support
    cob: "plaintext",
    cbl: "plaintext",
    cpl: "plaintext",

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