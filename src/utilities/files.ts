import * as micromatch from "micromatch";
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as promises from 'fs/promises';

import * as constants from "./fileConstants";

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
import { errorToString } from "./error";

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

interface GetAllProjectFilesOptions {
    useRelativePaths?: boolean;
    targetFolder?: vscode.Uri;
    debugFileCounts?: boolean;
}

export async function getAllProjectFiles(
    options?: GetAllProjectFilesOptions
): Promise<string[]> {
    let targetFolder: vscode.Uri | undefined = options?.targetFolder;
    if (!targetFolder) {
        if (vscode.workspace.workspaceFolders) {
            targetFolder = vscode.workspace.workspaceFolders![0].uri;
        } else {
            throw new Error("No workspace folders found. Please load a Project folder first");
        }
    }

    const prioritizedFileList = targetFolder?getPrioritizedFileList():[];

    const boostOnlyPatterns = buildBoostOnlyPatterns(targetFolder);

    const boostOnlySearchPattern = new vscode.RelativePattern(
        targetFolder.fsPath,
        `{${boostOnlyPatterns.join(',')}}`
    );
    const searchAllFilesPattern = new vscode.RelativePattern(
        targetFolder.fsPath,
        "**/*"
    );

    const ignoredPatternsByCategory = await buildProjectSourceCodeIgnorePattern(targetFolder, true);
    if (options?.debugFileCounts) {
        boostLogging.log(`Source files ignored by Category:`);
        for (const cp of ignoredPatternsByCategory!) {
            const files = await vscode.workspace.findFiles( cp.relativePattern);

            boostLogging.log(`\tSource files ignored by Category ${cp.category}: ${files.length}`);
            if (boostLogging.shouldLog("debug")) {
                files.forEach(f => boostLogging.debug(`\t\tIgnored: ${vscode.workspace.asRelativePath(f.fsPath)}`));
            }
        }
    }

    const ignorePatterns = `{${ignoredPatternsByCategory!.flatMap(cp => cp.patterns) ?? [].join(",")}}`;

    const allIgnoredPatterns = new vscode.RelativePattern(targetFolder, ignorePatterns);

    const files = boostOnlyPatterns.length?
                await vscode.workspace.findFiles( boostOnlySearchPattern, allIgnoredPatterns):
                await vscode.workspace.findFiles( searchAllFilesPattern, allIgnoredPatterns);
    if (options?.debugFileCounts && boostOnlyPatterns.length) {
        const totalFiles = await vscode.workspace.findFiles( searchAllFilesPattern, allIgnoredPatterns);
        boostLogging.log(`Source files excluded by Boost Only: ${totalFiles.length - files.length}`);
        if (boostLogging.shouldLog("debug")) {
            const excludedFiles : Set<string> = new Set(totalFiles.map(f => f.fsPath));
            files.forEach(f => excludedFiles.delete(f.fsPath));
            excludedFiles.forEach(f => boostLogging.debug(`\tExcluded: ${vscode.workspace.asRelativePath(f)}`));
        }
    }

    let paths: string[] = [];
    files.forEach((file) => {
        const pathToAdd = options?.useRelativePaths ? vscode.workspace.asRelativePath(file) : file.fsPath;
        paths.push(pathToAdd);
    });

    let prioritizedPaths: string[] = [];
    for (let relativeFile of prioritizedFileList) {
        const absoluteFile = vscode.Uri.joinPath(targetFolder, relativeFile).fsPath;
        const index = paths.findIndex(p => {
            const comparePath = options?.useRelativePaths ? vscode.workspace.asRelativePath(p) : p;
            return comparePath === absoluteFile;
        });
        
        if (index !== -1) {
            prioritizedPaths.push(paths[index]);
            paths.splice(index, 1);
        }
    }

    if (paths.length > 0) {
        if (options?.debugFileCounts) {
            boostLogging.log(`Source files deprioritized to bottom due to unspecified order: ${paths.length}`);
            paths.forEach(p => boostLogging.debug(`\tDeprioritized: ${p}`));
        } else {
            boostLogging.debug(`Source files deprioritized to bottom due to unspecified order: ${paths.length}`);
        }
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
        constants.boostIgnoreFilename
    );
    return boostignoreFile;
}

export function getGitIgnoreFile(): vscode.Uri | undefined {
    const workspaceFolder: vscode.Uri | undefined =
        vscode.workspace.workspaceFolders?.[0]?.uri;

    // if no workspace root folder, bail
    if (!workspaceFolder) {
        return undefined;
    }

    // path to the the .gitignore file
    const gitIgnoreUri = vscode.Uri.joinPath(
        workspaceFolder,
        constants.gitIgnoreFilename
    );
    return gitIgnoreUri;
}

export function updateGitIgnoreForTarget(
    targetFilepath: string,
    warnIfDoesntExist: boolean = true,
) {
    const gitignoreFile = getGitIgnoreFile();
    if (!gitignoreFile) {
        return;
    }

    let patterns = _extractIgnorePatternsFromFile(gitignoreFile.fsPath);

    // Convert path to relative path
    let targetRelativePath: string;
    targetRelativePath = vscode.workspace.asRelativePath(
        vscode.Uri.parse(targetFilepath),
        false
    );

    if (!fs.existsSync(targetFilepath)) {
        if (warnIfDoesntExist) {
            boostLogging.warn(`Unable to determine existence of file: ${targetFilepath}`, true);
        }
        return;
    }

    // search if the new target is already excluded in the existing patterns
    else if (
        patterns.some((pattern) =>
            micromatch.isMatch(targetRelativePath, pattern)
        )
    ) {
        boostLogging.warn(`${targetRelativePath} is already excluded in ${gitignoreFile.fsPath}`, false);
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

    fs.writeFileSync(gitignoreFile.fsPath, patterns.join("\n"));

    boostLogging.info(
        `${targetFilepath} has been added to ${gitignoreFile.fsPath}`,
        false
    );
}

export function updateBoostIgnoreForTarget(
    targetFilepath: string,
    absolutePath: boolean = true,
    warnIfDoesntExist: boolean = true,
    // we're going to assume this is a UI-based action, so we'll show a warning
    showUI: boolean = true
) {
    const boostignoreFile = getBoostIgnoreFile();
    if (!boostignoreFile) {
        return;
    }

    let patterns = _extractIgnorePatternsFromFile(boostignoreFile.fsPath);

    if (targetFilepath.startsWith("*")) {
        patterns.push(targetFilepath);
    } else {
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
            if (warnIfDoesntExist) {
                boostLogging.warn(`Unable to determine existence of file: ${targetFilepath}`, showUI);
            }
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
    }

    fs.writeFileSync(boostignoreFile.fsPath, patterns.join("\n"));

    boostLogging.info(
        `${targetFilepath} has been added to ${boostignoreFile.fsPath}`,
        false
    );
}

export async function createDefaultBoostIgnoreFile() {
    const boostIgnoreFileUri = getBoostIgnoreFile();
    if (!boostIgnoreFileUri) {
        return;
    }

    if (fs.existsSync(boostIgnoreFileUri.fsPath))
    {
        boostLogging.debug(`Existing ${vscode.workspace.asRelativePath(boostIgnoreFileUri)} found; skipping default creation`);
        return;
    }

    const initialFilesToIgnore = new Set<string>(constants.defaultBoostIgnorePaths);
    constants.potentiallyUsefulTextFiles.forEach((ignorePath) => {
        initialFilesToIgnore.add(ignorePath);
    });

    const files = await findExclusionItems();
    if (files) {
        const relativePaths = files.map(f => vscode.workspace.asRelativePath(f));
        relativePaths.forEach(path => initialFilesToIgnore.add(path));
    }

    initialFilesToIgnore.forEach((ignorePath) => {
        updateBoostIgnoreForTarget(ignorePath, false, false, false);
    });

}

async function findExclusionItems(baseDir: string = vscode.workspace.workspaceFolders![0].uri.fsPath): Promise<string[]> {
    const results: string[] = [];

    async function search(directory: string) {
        let items: string[] = [];
        try {
            items = await promises.readdir(directory);
        } catch (err) {
            boostLogging.debug(`Failed to read directory: ${directory}`);
            return;
        }

        for (const item of items) {
            // skip these hidden Mac folders since they won't be used for analysis anyway
            if (item === '.DS_Store' || item === '.git') {
                continue;
            }

            const fullPath = path.join(directory, item);
            if (item.startsWith('.')) {
                results.push(fullPath);

                const stat = await promises.stat(fullPath);
                if (stat.isDirectory()) {
                    continue; // No need to search inside, since parent is already excluded
                }
            } else {
                const stat = await promises.stat(fullPath);
                if (stat.isDirectory()) {
                    await search(fullPath);
                }
            }
        }
    }

    await search(baseDir);
    return results;
}

export const boostFolderDefaultName = ".boost";

interface CategorizedPatterns {
    category: string;
    patterns: string[];
    relativePattern: vscode.RelativePattern;
}

async function buildProjectSourceCodeIgnorePattern(
    targetFolder: vscode.Uri,
    ignoreBoostFolder: boolean = true
): Promise<CategorizedPatterns[] | null> {
    let workspaceFolder: vscode.Uri | undefined =
        vscode.workspace.workspaceFolders?.[0]?.uri;
    // if no workspace root folder, bail
    if (!workspaceFolder) {
        return null;
    }

    const categorizedPatterns: any [] = [];

    const ignoredFolders = `{${constants.defaultIgnoredFolders.join(",")}}`;

    // Find all .gitignore files in the workspace
    const gitignoreFiles = await vscode.workspace.findFiles(`**/${constants.gitIgnoreFilename}`, ignoredFolders);
    for (const gitignoreFile of gitignoreFiles) {
        const relativeDir = path.relative(workspaceFolder.fsPath, path.dirname(gitignoreFile.fsPath));
        
        const gitIgnorePatterns = _extractIgnorePatternsFromFile(gitignoreFile.fsPath);

        // Adjust the paths to be relative to the root of the workspace
        const adjustedPatterns = gitIgnorePatterns.map(pattern => {
            // If it's an absolute path or it starts with a special pattern (e.g. **/), don't modify it
            if (pattern.startsWith('/')) {
                return pattern;
            }

            // Prepend the relative directory path to the pattern
            return path.normalize(path.join(relativeDir, pattern));
        });
        
        categorizedPatterns.push(
            {category: ".gitignore", patterns: adjustedPatterns});
    }

    const boostIgnoreFile = getBoostIgnoreFile();
    if (!boostIgnoreFile) {
        return null;
    }
    categorizedPatterns.push(
        {category: ".boostignore", patterns:
            _extractIgnorePatternsFromFile(boostIgnoreFile.fsPath)});

    // Get all patterns from all categories for further checks and operations
    const allPatterns = categorizedPatterns.flatMap(cp => cp.patterns);

    // never include the .boost folder - since that's where we store our notebooks
    if (
        ignoreBoostFolder &&
        !allPatterns.find((pattern) => pattern === `**/${boostFolderDefaultName}/**`)
    ) {
        categorizedPatterns.push(
            {category: "Boost Folder", patterns: [`**/${boostFolderDefaultName}/**`]});
    } else if (!ignoreBoostFolder) {
        // remove the boost folder pattern if we're not ignoring it
        categorizedPatterns.forEach((cp : CategorizedPatterns) => {
            const index = cp.patterns.indexOf(`**/${boostFolderDefaultName}/**`);
            if (index !== -1) {
                cp.patterns.splice(index, 1);
            }
        });
    }

    // never include the .boostignore file since that's where we store our ignore patterns
    if (!allPatterns.find((pattern) => pattern === `**/${constants.boostIgnoreFilename}`)) {
        categorizedPatterns.push(
            {category: "Boost Ignore File", patterns: [`**/${constants.boostIgnoreFilename}`]});
    }

    categorizedPatterns.push(
        {category: "Binary Image/Build Files (e.g. mp4, jpg, gif, jar, elf, etc.)", patterns: constants.binaryFilePatterns});
    categorizedPatterns.push(
        {category: "Text Files (e.g. log, out, git, svg, etc.)", patterns: constants.textFilePatterns});

    categorizedPatterns.forEach((cp : CategorizedPatterns) => {
        const invalidPatterns = cp.patterns.filter(pattern => pattern.includes('{') || pattern.includes('}'));
        if (invalidPatterns.length > 0) {
            boostLogging.warn(`The following patterns have brackets and were removed: ${invalidPatterns.join(", ")}`, false);
        }
        
        const cleanedPatterns = cp.patterns.filter(pattern => !pattern.includes('{') && !pattern.includes('}'));
        cp.patterns = cleanedPatterns;

        const ignorePatterns = `{${cleanedPatterns.join(",")}}`;
        cp.relativePattern = new vscode.RelativePattern(targetFolder, ignorePatterns);        
    });

    return categorizedPatterns;
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

export async function removeOldBoostFiles() {
    let workspaceFolder: vscode.Uri | undefined =
        vscode.workspace.workspaceFolders?.[0]?.uri;
    // if no workspace root folder, bail
    if (!workspaceFolder) {
        return null;
    }

    // cleanup Notebook Summary files
    // cleanup Notebook files
    // cleanup Markdown files
    // cleanup HTML files
    // cleanup PDF files
    const cleanupPatterns = [
        "html",
        "pdf",
        "md",
        boostnb.NOTEBOOK_EXTENSION.substring(1),
        boostnb.NOTEBOOK_SUMMARY_EXTENSION.substring(1),
        boostnb.NOTEBOOK_GUIDELINES_EXTENSION.substring(1),
    ];

    // Search for all Notebooks HTML, Markdown, and PDF files within the ".boost" sub-folder
    const searchPattern = `${boostFolderDefaultName}/**/*.{${cleanupPatterns.join(",")}}`;

    const projectName = path.basename(workspaceFolder.fsPath);
    const allFiles = await getAllProjectFiles();
    allFiles.push(workspaceFolder.fsPath);
    const setOfAllFiles : Set<string> = new Set(allFiles);

    const boostFiles = await vscode.workspace.findFiles(searchPattern);
    const setOfFilesToTrash = new Set<vscode.Uri>();
    boostFiles.forEach((targetFileForCleanup : vscode.Uri) => {
        // get the extension first
        let extName = path.extname(targetFileForCleanup.fsPath);
        // ensure we check guidelines and summary files correctly
        if (extName === boostnb.NOTEBOOK_EXTENSION && targetFileForCleanup.fsPath.endsWith(boostnb.NOTEBOOK_SUMMARY_EXTENSION)) {
            extName = boostnb.NOTEBOOK_SUMMARY_EXTENSION;
        } else if (extName === boostnb.NOTEBOOK_EXTENSION && targetFileForCleanup.fsPath.endsWith(boostnb.NOTEBOOK_GUIDELINES_EXTENSION)) {
            extName = boostnb.NOTEBOOK_GUIDELINES_EXTENSION;
        }

        // then strip off the leading .boost folder and the extension
        const sourceFileWithExtension = vscode.workspace.asRelativePath(targetFileForCleanup.fsPath);
        let sourceFile = sourceFileWithExtension.substring(
            boostFolderDefaultName.length + path.sep.length,
            sourceFileWithExtension.length - extName.length);
        // if source file is an output file then strip that leading folder off too
        if (sourceFile.startsWith(`output${path.sep}`)) {
            sourceFile = sourceFile.substring(`output${path.sep}${extName.substring(1)}${path.sep}`.length);
        }

        // if its a normal file in our expected project list, then keep it
        if (setOfAllFiles.has(vscode.Uri.joinPath(workspaceFolder!, (sourceFile === projectName)?"":sourceFile).fsPath)) {
            return;
        } else {
            setOfFilesToTrash.add(targetFileForCleanup);
        }
    });

    // trash the files
    moveFilesToTrash([...setOfFilesToTrash]);
}

enum DeleteOption {
    permanentlyDelete = "PermanentlyDelete",
    systemTrash = "SystemTrash",
    localTrash = "LocalTrash",
    noCleanup = "NoCleanup",
}


async function moveFilesToTrash(
    filesToTrash: vscode.Uri[], deleteMethod = DeleteOption.systemTrash) {

    boostLogging.info(`Boost Cleanup Setinng: ${deleteMethod}`, false);

    for (const fileToTrash of filesToTrash) {
        if (deleteMethod === DeleteOption.noCleanup) {
            boostLogging.warn(`Keeping old Boost file: ${fileToTrash.fsPath}`, false);
            continue;
        }

        // this causes a user prompt - which we don't want in automated mode
        boostLogging.info(`Removing old Boost file: ${fileToTrash.fsPath}`, false);
        try {
            switch (deleteMethod) {
                case DeleteOption.permanentlyDelete:
                    fs.unlinkSync(fileToTrash.fsPath);
                    break;
                case DeleteOption.localTrash:
                    await moveFileToBoostTrash(fileToTrash);
                    break;
                case DeleteOption.systemTrash:
                default:
                    const we = new vscode.WorkspaceEdit();
                    we.deleteFile(fileToTrash);
                    await vscode.workspace.applyEdit(we);
                    break;
            }
        } catch (error) {
            boostLogging.error(`Unable to remove old Boost file: ${fileToTrash.fsPath} - ${errorToString(error)}`, false);
            continue;
        }
        boostLogging.warn(`Removed old Boost file to Trash: ${fileToTrash.fsPath}`, false);
    }
}

async function moveFileToBoostTrash(fileToTrash: vscode.Uri) {
    const boostTrashFolder = vscode.Uri.joinPath(
        vscode.workspace.workspaceFolders![0].uri,
        boostFolderDefaultName,
        constants.boostTrashFolder);

    let relativePath = vscode.workspace.asRelativePath(fileToTrash.fsPath);

    // Remove the first directory segment
    const pathSegments = relativePath.split(path.sep);
    pathSegments.shift();
    relativePath = pathSegments.join(path.sep);

    const trashFile = vscode.Uri.joinPath(boostTrashFolder, relativePath);
    const folderOfTrashFile = path.dirname(trashFile.fsPath);
    await promises.mkdir(folderOfTrashFile, { recursive: true });
    await promises.rename(fileToTrash.fsPath, trashFile.fsPath);
}
