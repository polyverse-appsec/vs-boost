import * as micromatch from "micromatch";
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import {
    boostLogging
} from "./boostLogging";

import {
    buildBoostOnlyPatterns
} from "./boostOnly";

import { ControllerOutputType } from '../controllers/controllerOutputTypes';

import {
    getBoostFile,
    BoostFileType,
    findCellByKernel,
} from "../extension/extension";

import * as boostnb from "../data/jupyter_notebook";


export function fullPathFromSourceFile(sourceFile: string): vscode.Uri {
    let baseFolder: string;
    let fullPath = sourceFile;
    if (vscode.workspace.workspaceFolders) {
        if (sourceFile.startsWith("./")) {
            const workspaceFolder = vscode.workspace.workspaceFolders[0]; // Get the first workspace folder
            baseFolder = workspaceFolder.uri.fsPath;
            fullPath = path.join(baseFolder, sourceFile);
            const normalizedFullPath = path.normalize(fullPath);
            fullPath = normalizedFullPath;
        }
    }
    return vscode.Uri.parse(fullPath);
}

export function getPrioritizedFileList() : string[] {
    let prioritizedFilelist : string[] = [];

    const summaryNotebookUri = getBoostFile(undefined, { format: BoostFileType.summary, showUI: false });
    if (!fs.existsSync(summaryNotebookUri.fsPath)) {
        return prioritizedFilelist;
    }

    const summaryNotebook = new boostnb.BoostNotebook();
    summaryNotebook.load(summaryNotebookUri.fsPath);
    const blueprint = findCellByKernel(summaryNotebook, ControllerOutputType.blueprint) as boostnb.BoostNotebookCell;
    if (!blueprint?.outputs) {
        return prioritizedFilelist;
    }

    const quickBlueprintOutput = blueprint.outputs.filter((output) => {
        return output.metadata.outputType === ControllerOutputType.blueprint;
    });

    if (quickBlueprintOutput.length === 0) {
        return prioritizedFilelist;
    }

    prioritizedFilelist = quickBlueprintOutput[0].metadata.details.prioritizedListOfSourceFilesToAnalyze;
    return prioritizedFilelist?prioritizedFilelist:[];
}

export async function getAllProjectFiles(
    useRelativePaths: boolean = false,
    targetFolder : vscode.Uri | undefined = undefined
): Promise<string[]> {
    if (!targetFolder) {
        if (vscode.workspace.workspaceFolders) {
            targetFolder = vscode.workspace.workspaceFolders![0].uri;
        } else {
            throw new Error("No workspace folders found. Please load a Project folder first");
        }
    }

    const prioritizedFileList = targetFolder?getPrioritizedFileList():[];

    const boostOnlyPatterns = buildBoostOnlyPatterns(targetFolder);

    const searchPattern = new vscode.RelativePattern(
        targetFolder.fsPath,
        boostOnlyPatterns.length ? `{${boostOnlyPatterns.join(',')}}` : "**/**"
    );

    const ignorePatterns = buildVSCodeIgnorePattern(targetFolder, true);
    const files = await vscode.workspace.findFiles(
        searchPattern,
        ignorePatterns
    );

    let paths: string[] = [];
    files.forEach((file) => {
        const pathToAdd = useRelativePaths ? vscode.workspace.asRelativePath(file) : file.fsPath;
        paths.push(pathToAdd);
    });

    let prioritizedPaths: string[] = [];
    for (let relativeFile of prioritizedFileList) {
        const absoluteFile = vscode.Uri.joinPath(targetFolder, relativeFile).fsPath;
        const index = paths.findIndex(p => {
            const comparePath = useRelativePaths ? vscode.workspace.asRelativePath(p) : p;
            return comparePath === absoluteFile;
        });
        
        if (index !== -1) {
            prioritizedPaths.push(paths[index]);
            paths.splice(index, 1);
        }
    }

    if (paths.length > 0) {
        boostLogging.debug(`Source files deprioritized to bottom due to unspecified order: ${paths.length}`);
        prioritizedPaths = [...prioritizedPaths, ...paths];
    }

    return prioritizedPaths;
}

export function getBoostIgnoreFile(): vscode.Uri | undefined {
    const workspaceFolder: vscode.Uri | undefined =
        vscode.workspace.workspaceFolders?.[0]?.uri;

    // if no workspace root folder, bail
    if (!workspaceFolder) {
        return undefined;
    }

    // path to the the .boostignore file
    const boostignoreFile = vscode.Uri.joinPath(
        workspaceFolder,
        ".boostignore"
    );
    return boostignoreFile;
}

export function updateBoostIgnoreForTarget(
    targetFilepath: string,
    absolutePath: boolean = true
) {
    // we're going to assume this is a UI-based action, so we'll show a warning
    const showUI = true;
    const boostignoreFile = getBoostIgnoreFile();
    if (!boostignoreFile) {
        return;
    }

    let patterns = _extractIgnorePatternsFromFile(boostignoreFile.fsPath);

    // Convert path to relative path
    let targetRelativePath: string;
    if (absolutePath) {
        targetRelativePath = vscode.workspace.asRelativePath(
            vscode.Uri.parse(targetFilepath),
            false
        );
    } else {
        targetRelativePath = targetFilepath;
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
        if (!workspaceRoot) {
            boostLogging.warn(`Please load a Project folder first`, showUI);
            return;
        }
        targetFilepath = vscode.Uri.joinPath(
            workspaceRoot,
            targetFilepath
        ).fsPath;
    }

    if (!fs.existsSync(targetFilepath)) {
        boostLogging.warn(`Unable to determine existence of file: ${targetFilepath}`, showUI);
        return;
    }
    // search if the new target is already excluded in the existing patterns
    else if (
        patterns.some((pattern) =>
            micromatch.isMatch(targetRelativePath, pattern)
        )
    ) {
        boostLogging.warn(`${targetRelativePath} is already excluded in ${boostignoreFile.fsPath}`, false);
        return;
    }

    // otherwise need to exclude the target in the ignore file
    // Check if the target is a directory or a file
    const stats = fs.statSync(targetFilepath);
    if (stats.isDirectory()) {
        patterns.push(targetRelativePath + "/**"); // Add glob to match all files/folders under the directory
    } else if (stats.isFile()) {
        patterns.push(targetRelativePath); // If it's a file, just add the file path
    }

    fs.writeFileSync(boostignoreFile.fsPath, patterns.join("\n"));

    boostLogging.info(
        `${targetRelativePath} has been added to ${boostignoreFile.fsPath}`,
        false
    );
}

function buildVSCodeIgnorePattern(
    targetFolder: vscode.Uri,
    ignoreBoostFolder: boolean = true
): vscode.RelativePattern | null {
    let workspaceFolder: vscode.Uri | undefined =
        vscode.workspace.workspaceFolders?.[0]?.uri;
    // if no workspace root folder, bail
    if (!workspaceFolder) {
        return null;
    }

    const patterns: string[] = [];

    // read the .vscodeignore file
    let vscignoreFile = vscode.Uri.joinPath(workspaceFolder, ".vscodeignore");
    const vscodeIgnorePatterns = _extractIgnorePatternsFromFile(
        vscignoreFile.fsPath
    );
    patterns.push(...vscodeIgnorePatterns);

    // read the .gitignore file
    let gitignoreFile = vscode.Uri.joinPath(workspaceFolder, ".gitignore");
    const gitIgnorePatterns = _extractIgnorePatternsFromFile(
        gitignoreFile.fsPath
    );
    patterns.push(...gitIgnorePatterns);

    const boostIgnoreFile = getBoostIgnoreFile();
    if (!boostIgnoreFile) {
        return null;
    }
    patterns.push(
        ...patterns.concat(
            _extractIgnorePatternsFromFile(boostIgnoreFile.fsPath)
        )
    );

    // never include the .boost folder - since that's where we store our notebooks
    if (
        ignoreBoostFolder &&
        !patterns.find((pattern) => pattern === "**/.boost/**")
    ) {
        patterns.push("**/.boost/**");
    } else if (!ignoreBoostFolder) {
        patterns.splice(patterns.indexOf("**/.boost/**"), 1);
    }

    // never include the .boostignore file since that's where we store our ignore patterns
    if (!patterns.find((pattern) => pattern === "**/.boostignore")) {
        patterns.push("**/.boostignore");
    }
    // add common binary file types to the exclude patterns
    const binaryFilePatterns = [
        "**/*.jpg",
        "**/*.jpeg",
        "**/*.png",
        "**/*.gif",
        "**/*.bmp",
        "**/*.tiff",
        "**/*.ico",
        "**/*.pdf",
        "**/*.zip",
        "**/*.tar",
        "**/*.gz",
        "**/*.rar",
        "**/*.7z",
        "**/*.exe",
        "**/*.dll",
        "**/*.so",
        "**/*.bin",
        "**/*.ppt",
        "**/*.pptx",
        "**/*.doc",
        "**/*.docx",
        "**/*.xls",
        "**/*.xlsx",
        "**/*.psd",
        "**/*.ai",
        "**/*.flv",
        "**/*.mp4",
        "**/*.avi",
        "**/*.mkv",
        "**/*.mpeg",
        "**/*.mp3",
        "**/*.wav",
        "**/*.flac",
        "**/*.aac",
        "**/*.ogg",
        "**/*.iso",
        "**/*.dmg",
        "**/*.jar",
        "**/*.war",
        "**/*.ear",
        "**/*.pyc",
        "**/*.pyo",
        "**/*.class",
        "**/*.sqlite",
        "**/*.db",
        "**/*.ttf",
        "**/*.otf",
        "**/*.ipynb_checkpoints",
        "**/*.ipynb_checkpoints/**",
        "**/*.git",
        "**/*.svn",
        "**/*.hg",
        "**/*.bz2",
        "**/*.app",
        "**/*.appx",
        "**/*.appxbundle",
        "**/*.msi",
        "**/*.deb",
        "**/*.rpm",
        "**/*.elf",
        "**/*.sys",
        "**/*.odt",
        "**/*.ods",
        "**/*.odp",
    ];

    const textFilePatterns = [
        "**/*.svg",
        "**/*.*ignore",
        "**/*.gitignore",
        "**/*.gitattributes",
        "**/*.log",
        "**/*.out",
        "**/*.dockerignore",
        "**/*.gitkeep",
        "**/*.gitmodules",
        "**/*.gitconfig",
    ];

    const potentiallyUsefulTextFiles = [
        "**/*.ipynb", // Jupyter notebooks
        "**/*.sql", // SQL scripts
        "**/*.rtf", // Rich text files
        "**/*.csv", // Data files that might be read by scripts
        "**/*.tsv", // Data files that might be read by scripts
        "**/*.dist", // Often used for distribution config files
    ];

    patterns.push(
        ...binaryFilePatterns,
        ...textFilePatterns,
        ...potentiallyUsefulTextFiles
    );

    // const exclude = '{**/node_modules/**,**/bower_components/**}';
    const ignorePatterns = "{" + patterns.join(",") + "}";
    //    boostLogging.debug( "Skipping source files of pattern: " + (ignorePatterns ?? "none") );

    return new vscode.RelativePattern(targetFolder, ignorePatterns);
}

function _extractIgnorePatternsFromFile(ignoreFile: string): string[] {
    // if no ignore file, bail
    if (!fs.existsSync(ignoreFile)) {
        return [];
    }

    const ignoreFileContent = fs.readFileSync(ignoreFile, "utf-8");
    const patterns = ignoreFileContent.split(/\r?\n/).filter((line) => {
        return line.trim() !== "" && !line.startsWith("#");
    });
    return patterns;
}