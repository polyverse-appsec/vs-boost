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
import { BoostConfiguration } from "../extension/boostConfiguration";

export function fullPathFromSourceFile(sourceFile: string): vscode.Uri {
    let baseFolder: string;
    let fullPath = sourceFile;
    if (!(vscode.workspace.workspaceFolders && sourceFile.startsWith("./"))) {
        return vscode.Uri.file(fullPath);
    }

    const workspaceFolder = vscode.workspace.workspaceFolders[0]; // Get the first workspace folder
    baseFolder = workspaceFolder.uri.fsPath;
    fullPath = path.join(baseFolder, sourceFile);
    const normalizedFullPath = path.normalize(fullPath);
    fullPath = normalizedFullPath;
    return vscode.Uri.file(fullPath);
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
    enforceFileLimit?: boolean;
    projectFileLimit?: number;
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
            // we need to filter out of the patterns anything with a leading !
            const filteredRelativePattern = new vscode.RelativePattern(cp.relativePattern.baseUri, `{${cp.patterns.filter(p => !p.startsWith('!')).join(",")}}`);
            const files = await vscode.workspace.findFiles( filteredRelativePattern);

            boostLogging.log(`\tSource files ignored by Category ${cp.category}: ${files.length}`);
            if (boostLogging.shouldLog("debug")) {
                files.forEach(f => boostLogging.debug(`\t\tIgnored: ${vscode.workspace.asRelativePath(f.fsPath)}`));
            }
        }
    }

        // Extract negation patterns and remove them from ignored patterns
    const negationPatterns = ignoredPatternsByCategory?_extractNegationPatterns(ignoredPatternsByCategory.flatMap(cp => cp.patterns)):undefined;
    const ignorePatterns = ignoredPatternsByCategory?`{${ignoredPatternsByCategory!.flatMap(cp => cp.patterns.filter(p => !p.startsWith('!'))) ?? [].join(",")}}`:undefined;

    const allIgnoredPatterns = ignorePatterns?new vscode.RelativePattern(targetFolder, ignorePatterns):undefined;

    // if 0 limit in config or we're not enforcing hard limit, then no limit to search
    // NOTE: even if we don't enforce hard limit on search, we still will never return more results than the limit
    //       this is just to allow us to search for more files than the limit, but still return the limit
    const projectFileCountHardLimit = (BoostConfiguration.projectFileCountLimit === 0)?
        undefined:
        // NOTE: We allow the caller to override the project limit (e.g. file cleanup)
        options?.projectFileLimit?
            (options!.projectFileLimit === 0)?undefined:options!.projectFileLimit:
            BoostConfiguration.projectFileCountLimit;
    const projectFileCountSoftLimit = !projectFileCountHardLimit?undefined:
        options?.enforceFileLimit?projectFileCountHardLimit + 1:undefined;

    let files = boostOnlyPatterns.length?
                await vscode.workspace.findFiles( boostOnlySearchPattern, allIgnoredPatterns, projectFileCountSoftLimit):
                await vscode.workspace.findFiles( searchAllFilesPattern, allIgnoredPatterns, projectFileCountSoftLimit);
    if (options?.debugFileCounts && boostOnlyPatterns.length) {
        const totalFiles = await vscode.workspace.findFiles( searchAllFilesPattern, allIgnoredPatterns);
        boostLogging.log(`Source files excluded by Boost Only: ${totalFiles.length - files.length}`);
        if (boostLogging.shouldLog("debug")) {
            const excludedFiles : Set<string> = new Set(totalFiles.map(f => f.fsPath));
            files.forEach(f => excludedFiles.delete(f.fsPath));
            excludedFiles.forEach(f => boostLogging.debug(`\tExcluded: ${vscode.workspace.asRelativePath(f)}`));
        }
    }

    // Manually include files that match negation patterns
    if (negationPatterns && negationPatterns.length > 0) {
        let negatedFilesToAddBack : vscode.Uri[] = [];
        // never include .boost folder, no matter what
        const ignoreBoostFolders = new vscode.RelativePattern(targetFolder, `**/${boostFolderDefaultName}/**`);
        for (const pattern of negationPatterns) {
            const negationFiles = await vscode.workspace.findFiles(pattern, ignoreBoostFolders, files.length);
            negatedFilesToAddBack = negatedFilesToAddBack.concat(negationFiles);
        }
        if (options?.debugFileCounts && negatedFilesToAddBack.length) {
            boostLogging.log(`Source files re-added by ! inversion syntax: ${negatedFilesToAddBack.length - files.length}`);
            if (boostLogging.shouldLog("debug")) {
                const readdedFiles : Set<string> = new Set(negatedFilesToAddBack.map(f => f.fsPath));
                readdedFiles.forEach(f => boostLogging.debug(`\tRe-Added: ${vscode.workspace.asRelativePath(f)}`));
            }
        }
        files = files.concat(negatedFilesToAddBack);
    }    
    const paths: string[] = [];

    const includeFilePatterns = _extractFilterPatternsFromFile(getBoostIncludeFile()!.fsPath);
    const includeNegationPatterns = _extractNegationPatterns(includeFilePatterns);

    // Remove the negation patterns from the include patterns
    const filteredIncludePatterns = includeFilePatterns.filter(p => !p.startsWith('!'));
    
    if (filteredIncludePatterns.length > 0) {
        const includePatterns = new vscode.RelativePattern(targetFolder, `{${filteredIncludePatterns.join(',')}}`);
        // make sure we never include the boost folder
        if (includeNegationPatterns.length > 0) {
            includeNegationPatterns.push(`**/${boostFolderDefaultName}/**`);
        }
        const includeIgnorePatterns = includeNegationPatterns.length > 0 ?
            new vscode.RelativePattern(targetFolder, `{${includeNegationPatterns.join(',')}}`) :
            undefined;
        const includeFiles = await vscode.workspace.findFiles(includePatterns, includeIgnorePatterns, projectFileCountSoftLimit);
        if (options?.debugFileCounts) {
            boostLogging.log(`Source files included by Boost Include: ${includeFiles.length}`);
            if (boostLogging.shouldLog("debug")) {
                includeFiles.forEach(f => boostLogging.debug(`\tIncluded: ${vscode.workspace.asRelativePath(f.fsPath)}`));
            }
        }
        paths.push(...includeFiles.map(f => options?.useRelativePaths ? vscode.workspace.asRelativePath(f) : f.fsPath));
    }
    const pathsSet : Set<string> = new Set<string>(paths);

    if (projectFileCountHardLimit && files.length > projectFileCountHardLimit) {
        if (options?.enforceFileLimit) {
            const fileLimitError = `Project file count limit of ${projectFileCountHardLimit} exceeded. Analysis aborted. To resume analysis, change Boost Settings for 'projectFileCountLimit' to a higher limit, or update file search via .gitignore, .boostignore, .boostinclude, and/or .boostonly`;
            boostLogging.error(fileLimitError, false);
            throw new Error(fileLimitError);
        } else {
            boostLogging.warn(`Project file count limit of ${projectFileCountHardLimit} exceeded (search resulted in ${files.length} files). Only the first ${projectFileCountHardLimit} files will be processed, excluding ${files.length - projectFileCountHardLimit} files.`, false);
            files = files.slice(0, projectFileCountHardLimit);
        }
    }

    files.forEach((file) => {
        const pathToAdd = options?.useRelativePaths ? vscode.workspace.asRelativePath(file) : file.fsPath;
        if (!pathsSet.has(pathToAdd)) {
            paths.push(pathToAdd);
        }
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

// Common function to get a .gitignore or .boostignore file
function getFilterFile(filterFile: string): vscode.Uri | undefined {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders) {
        return undefined;
    }
    const workspaceFolder = workspaceFolders[0].uri;
    return vscode.Uri.joinPath(workspaceFolder, filterFile);
}

// Common function to update either .gitignore or .boostignore files
function updateFilterFileForTarget(
    filterFilename: string,
    targetFilepath: string,
    {
        absolutePath = true,
        warnIfDoesntExist = true,
        createIfNotExists = true,
        showUI = false
    } = {}
) {
    const filterFileUri = getFilterFile(filterFilename);
    if (!filterFileUri) {
        if (warnIfDoesntExist) {
            boostLogging.warn(`Workspace folder is not found. Cannot update ${filterFilename}.`, showUI);
        }
        return;
    } else if (!fs.existsSync(filterFileUri.fsPath) && !createIfNotExists) {
        boostLogging.warn(`Existing file not found; ignoring update: ${filterFilename}`);
        return;
    }

    const filterFilePath = filterFileUri.fsPath;

    let patterns = _extractFilterPatternsFromFile(filterFilePath);

    // if the target filter is a wildcard, then skip actual file existence checks, and just add it directly
    //      to default ignore list
    let newPattern = targetFilepath;
    if (!targetFilepath.includes("*")) {
        let targetRelativePath = targetFilepath;
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
        if (absolutePath) {
            if (!workspaceFolder) {
                if (warnIfDoesntExist) {
                    boostLogging.warn(`Workspace folder is not found. Cannot update ${filterFilename}.`, showUI);
                }
                return;
            }
            targetRelativePath = vscode.workspace.asRelativePath(targetFilepath, false);
        } else {
            targetFilepath = vscode.Uri.joinPath(workspaceFolder!, targetFilepath).fsPath;
        }

        if (!fs.existsSync(targetFilepath) && warnIfDoesntExist) {
            boostLogging.warn(`File ${targetFilepath} does not exist.`, showUI);
            return;
        }

        newPattern = targetRelativePath;
        if (fs.existsSync(targetFilepath)) {
            const stats = fs.statSync(targetFilepath);
            if (stats.isDirectory()) {
                newPattern = targetRelativePath + "/**";
            } else {
                newPattern = targetRelativePath;
            }
        } else if (targetFilepath.endsWith("/")) {
            newPattern = targetRelativePath + "**";
        } else {
            newPattern = targetRelativePath;
        }
    } else {
        // directly add the existing wildcard pattern, regardless of current file existence
        boostLogging.debug(`${filterFilename} updated with: ${newPattern}`);
    }

    if (patterns.some(pattern => micromatch.isMatch(newPattern, pattern))) {
        boostLogging.warn(`${newPattern} is already in ${filterFilePath}.`, showUI);
        return;
    }

    // add the new pattern to the end of the list
    patterns.push(newPattern);

    fs.writeFileSync(filterFilePath, patterns.join("\n"));
    boostLogging.info(`${targetFilepath} has been added to ${filterFilePath}.`, showUI);
}

// Function to update .gitignore, uses the common function
export function updateGitIgnoreForTarget(targetFilepath: string, warnIfDoesntExist: boolean = true, createIfNotExists = true) {
    updateFilterFileForTarget(constants.gitIgnoreFilename, targetFilepath,
        { absolutePath: true, warnIfDoesntExist, showUI: false, createIfNotExists });
}

// Function to update .boostignore, uses the common function
export function updateBoostIgnoreForTarget(
    targetFilepath: string,
    absolutePath: boolean = true,
    warnIfDoesntExist: boolean = true,
    showUI: boolean = true
) {
    updateFilterFileForTarget(constants.boostIgnoreFilename, targetFilepath, { absolutePath, warnIfDoesntExist, showUI });
}

// Function to update .boostinclude, uses the common function
export function updateBoostIncludeForTarget(
    targetFilepath: string,
    absolutePath: boolean = true,
    warnIfDoesntExist: boolean = true,
    showUI: boolean = true
) {
    updateFilterFileForTarget(constants.boostIncludeFilename, targetFilepath, { absolutePath, warnIfDoesntExist, showUI });
}

// Now we use the generic function for specific cases
export const getBoostIgnoreFile = () => getFilterFile(constants.boostIgnoreFilename);
export const getGitIgnoreFile = () => getFilterFile(constants.gitIgnoreFilename);
export const getBoostIncludeFile = () => getFilterFile(constants.boostIncludeFilename);

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
        
        const gitIgnorePatterns = _extractFilterPatternsFromFile(gitignoreFile.fsPath);

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
            _extractFilterPatternsFromFile(boostIgnoreFile.fsPath)});

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

    // never include the .boostInclude file since that's where we store our include patterns
    if (!allPatterns.find((pattern) => pattern === `**/${constants.boostIncludeFilename}`)) {
        categorizedPatterns.push(
            {category: "Boost Include File", patterns: [`**/${constants.boostIncludeFilename}`]});
    }

    for (let i = 0; i < constants.defaultIgnoredFolders.length; i++) {
        if (!allPatterns.find((pattern) => pattern === constants.defaultIgnoredFolders[i])) {
            categorizedPatterns.push(
                {category: `Default Ignored Folder: ${constants.defaultIgnoredFolders[i]}`, patterns: [constants.defaultIgnoredFolders[i]]});
        }
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

function _extractFilterPatternsFromFile(filterFile: string): string[] {
    // if no filter file, bail
    if (!fs.existsSync(filterFile)) {
        return [];
    }

    const filterFileContent = fs.readFileSync(filterFile, "utf-8");
    const patterns = filterFileContent.split(/\r?\n/).filter((line) => {
        return line.trim() !== "" && !line.startsWith("#");
    });
    return patterns;
}

function _extractNegationPatterns(patterns: string[]): string[] {
    return patterns
        .filter(pattern => pattern.startsWith('!'))
        .map(pattern => pattern.substring(1)); // Remove '!' prefix
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
    // we're not going to enforce the limit here since we may need to cleanup a large amount of stale files from incorrect settings
    const allFiles = await getAllProjectFiles({enforceFileLimit: false, projectFileLimit: 0});
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
