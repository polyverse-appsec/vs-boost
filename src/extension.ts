import * as vscode from 'vscode';

import * as fs from 'fs';
import * as path from 'path';

import * as micromatch from 'micromatch';

import * as boostnb from './jupyter_notebook';

import { BoostContentSerializer } from './serializer';
import { parseFunctions } from './split';
import { BoostConfiguration } from './boostConfiguration';
import { boostLogging } from './boostLogging';
import { TextDecoder } from 'util';
import { PROJECT_EXTENSION } from './BoostProjectData';
import { errorMimeType } from './base_controller';
import { BoostExtension } from './BoostExtension';
import { ControllerOutputType } from './controllerOutputTypes';


export enum BoostFileType {
    notebook = "notebook",
    summary = "summary",
    status = "status",
    guidelines = "guidelines"
}

export function getKernelName(kernelName: string): string {
    return 'polyverse-boost-' + kernelName + '-kernel';
}

export const boostActivityBarId = "polyverse-boost-explorer";

export enum BoostCommands {
    loadCurrentFile = "loadCurrentFile",
    loadCurrentFolder = "loadCurrentFolder",
    loadSummaryFile = "loadSummaryFile",

    processCurrentFolder = "processCurrentFolder",
    processCurrentFile = "processCurrentFile",

    processProject = "processProject",

    buildCurrentFileOutput = "buildCurrentFileOutput",
    buildCurrentFileSummaryOutput = "buildCurrentFileSummaryOutput",
    buildCurrentFolderOutput = "buildCurrentFolderOutput",
    buildCurrentFolderSummaryOutput = "buildCurrentFolderSummaryOutput",
    showCurrentFileAnalysisOutput = "showCurrentFileAnalysisOutput",
    showCurrentFileAnalysisSummaryOutput = "showCurrentFileAnalysisSummaryOutput",
    showCurrentFolderAnalysisSummaryOutput = "showCurrentFolderAnalysisSummaryOutput",
    excludeTargetFromBoostAnalysis = "excludeTargetFromBoostAnalysis",
    excludeTargetFolderFromBoostAnalysis = "excludeTargetFolderFromBoostAnalysis",

    analyzeSourceCode = "analyzeSourceCode",

    refreshProjectData = "refreshProjectData",

    showGuidelines = "showGuidelines",
}

export async function activate(context: vscode.ExtensionContext) {
    try {
        // we use a friendly name for the channel as this will be displayed to the user in the output pane
        boostLogging.log('Activating Boost Notebook Extension');

        const extension = new BoostExtension(context);

    } catch (error) {
        boostLogging.error(`Unable to activate Boost Notebook Extension due to error:${error}. Please retry launching, check your Boost configuration, or contact Polyverse Boost Support`, true);
    }
}

// for completeness, we provide a deactivate function - asynchronous return
//    if we have resources to cleanup in the future
export async function deactivate(): Promise<void> {
    const outputChannel = vscode.window.createOutputChannel(boostnb.NOTEBOOK_TYPE);

    outputChannel.appendLine('Deactivating Boost Notebook Extension');
  
    return undefined;
}

export function getBoostFile(sourceFile: vscode.Uri | undefined, format: BoostFileType = BoostFileType.notebook, showUI: boolean = false): vscode.Uri {
    // if we don't have a workspace folder, just place the Boost file in a new Boostdir - next to the source file
    let baseFolder;
    if (!vscode.workspace.workspaceFolders) {
        if (!sourceFile) {
            throw new Error("Unable to determine source file for Boost file");
        }
        baseFolder = path.dirname(sourceFile.fsPath);
    }
    else {
        const workspaceFolder = vscode.workspace.workspaceFolders[0]; // Get the first workspace folder
        baseFolder = workspaceFolder.uri.fsPath;
        // if user didn't specify a source file, then we'll get the global project file
        if (!sourceFile) {
            sourceFile = workspaceFolder.uri;
        }
    }
    if (!sourceFile) {
        throw new Error("Unable to determine source file for Boost file");
    }

    // Check if baseFolder exists
    if (!fs.existsSync(baseFolder)) {
        throw new Error(`Base folder does not exist: ${baseFolder}`);
    }

    // create the .boost folder if we need to - this is statically located in the workspace folder no matter which child folder is processed
    const nonNormalizedBoostFolder = path.join(baseFolder, BoostConfiguration.defaultDir);
    const boostFolder = path.normalize(nonNormalizedBoostFolder);
    if (!fs.existsSync(boostFolder)) {
        try {
            fs.mkdirSync(boostFolder, { recursive: true });
        } catch (error) {
            throw new Error(`Failed to create Boost folder at ${boostFolder} due to Error: ${error} - possible permission issue`);
        }
    }

    // get the distance from the workspace folder for the source file
            // for project-level status files, we ignore the relative path
    let relativePath = (baseFolder === sourceFile.fsPath)?
        path.basename(baseFolder):path.relative(baseFolder,sourceFile.fsPath);
    // create the .boost file path, from the new boost folder + amended relative source file path
    switch (format) {
        case BoostFileType.summary:
        case BoostFileType.guidelines:

            // default to summary
            let extension = boostnb.NOTEBOOK_SUMMARY_EXTENSION;
            if (format === BoostFileType.guidelines) {
                extension = boostnb.NOTEBOOK_GUIDELINES_EXTENSION;
            }

            // if the new file is outside of our current workspace, then warn user
            // and place the new .boost file next to it (not great, but better than nothing)
            if (relativePath.startsWith("..")) {
                boostLogging.warn(`Boost Notebook file ${sourceFile.fsPath} is outside of current workspace ${baseFolder}`, showUI);
                const externalBoostFile = sourceFile.fsPath + extension;
                return vscode.Uri.file(externalBoostFile);
            } else {
                // if we're targeting a folder, and the folder is the workspace name, then name it after the project
                if (!relativePath) {
                    relativePath = path.basename(baseFolder);
                }
                // create the .boost file path, from the new boost folder + amended relative source file path
                const absoluteBoostNotebookFile = path.join(
                    boostFolder, relativePath + extension);
                const normalizedAbsoluteBoostNotebookFile = path.normalize(absoluteBoostNotebookFile);

                return vscode.Uri.file(normalizedAbsoluteBoostNotebookFile);
            }
        case BoostFileType.status:
            const absoluteboostProjectDataFile = path.join(boostFolder, relativePath + PROJECT_EXTENSION);
            const normalizedAbsoluteBoostProjectDataFile = path.normalize(absoluteboostProjectDataFile);
            
            let boostProjectDataFile = vscode.Uri.file(normalizedAbsoluteBoostProjectDataFile);
            return boostProjectDataFile;
        case BoostFileType.notebook:
        default:
            // if the new file is outside of our current workspace, then warn user
            // and place the new .boost file next to it (not great, but better than nothing)
            if (relativePath.startsWith("..")) {
                boostLogging.warn(`Boost Notebook file ${sourceFile.fsPath} is outside of current workspace ${baseFolder}`, showUI);
                const externalBoostFile = sourceFile.fsPath + boostnb.NOTEBOOK_EXTENSION;
                return vscode.Uri.file(externalBoostFile);
            } else {
                // if we're targeting a folder, and the folder is the workspace name, then name it after the project
                if (!relativePath) {
                    relativePath = path.basename(baseFolder);
                }
                // create the .boost file path, from the new boost folder + amended relative source file path
                const absoluteBoostNotebookFile = path.join(
                    boostFolder, relativePath + boostnb.NOTEBOOK_EXTENSION);
                const normalizedAbsoluteBoostNotebookFile = path.normalize(absoluteBoostNotebookFile);

                return vscode.Uri.file(normalizedAbsoluteBoostNotebookFile);
            }
    }
}

export function findCellByKernel(targetNotebook: vscode.NotebookDocument | boostnb.BoostNotebook, outputType: string): vscode.NotebookCell | boostnb.BoostNotebookCell | undefined {
    let cells: (vscode.NotebookCell | boostnb.BoostNotebookCell)[] = [];

    const usingBoostNotebook = targetNotebook instanceof boostnb.BoostNotebook;
    if (usingBoostNotebook) {
        cells = targetNotebook.cells;
    } else {
        cells = targetNotebook.getCells();
    }

    for (const cell of cells) {
        if (cell.metadata?.outputType === outputType) {
            return cell;
        }
    }

    return undefined;
}

export async function createOrOpenSummaryNotebookFromSourceFile(sourceFile : vscode.Uri) :
        Promise<boostnb.BoostNotebook> {

    const notebookSummaryPath = getBoostFile(sourceFile, BoostFileType.summary);
    const summaryFileExists = fs.existsSync(notebookSummaryPath.fsPath);
    // if doesn't exist, create it
    if (!summaryFileExists) {
        const newNotebook = await createEmptyNotebook(notebookSummaryPath, false) as boostnb.BoostNotebook;

        const sourceFilePath = sourceFileFromFullPath(sourceFile);

        let newMetadata = {
            ...newNotebook.metadata,
            sourceFile: sourceFilePath};

        newNotebook.metadata = newMetadata;

        // boost notebook needs to be saved explicitly - while the VSC notebook background saves
        newNotebook.save(notebookSummaryPath.fsPath);
        return newNotebook;
    } else {
        const newNotebook = new boostnb.BoostNotebook();
        newNotebook.load(notebookSummaryPath.fsPath);
        return newNotebook;
    }
}

export async function createOrOpenNotebookFromSourceFile(
    sourceFile : vscode.Uri,
    useBoostNotebookWithNoUI : boolean,
    overwriteIfExists : boolean = false,
    existingNotebook : vscode.NotebookDocument | boostnb.BoostNotebook | undefined = undefined) :
        Promise<vscode.NotebookDocument | boostnb.BoostNotebook> {

    let newNotebook : vscode.NotebookDocument | boostnb.BoostNotebook;
    const notebookPath = getBoostFile(sourceFile);
    const fileExists = fs.existsSync(notebookPath.fsPath);
    if (fileExists) {
        if (useBoostNotebookWithNoUI) {
            newNotebook = new boostnb.BoostNotebook();
            newNotebook.load(notebookPath.fsPath);
        } else {
            newNotebook = await vscode.workspace.openNotebookDocument(notebookPath);
        }
        return newNotebook;
    }

    boostLogging.debug(`Boosting file: ${sourceFile.fsPath} as ${notebookPath.fsPath}`);
    newNotebook = await createEmptyNotebook(notebookPath, !useBoostNotebookWithNoUI);

    // load/parse source file into new notebook
    await parseFunctionsFromFile(sourceFile, newNotebook);

    if (useBoostNotebookWithNoUI) {
        newNotebook.save(notebookPath.fsPath);
    } else {
        // Save the notebook to disk
        const notebookData = await (new BoostContentSerializer()).serializeNotebookFromDoc(newNotebook as vscode.NotebookDocument);
        fs.writeFileSync(notebookPath.fsPath, notebookData);
    }
    return newNotebook;
}

export async function parseFunctionsFromFile(
    fileUri : vscode.Uri,
    targetNotebook : boostnb.BoostNotebook | vscode.NotebookDocument) {

    const fileContents = fs.readFileSync(fileUri.fsPath, 'utf8');
    
    // turn fileContents into a string and call splitCode
    const fileContentsString = fileContents.toString();
    const [languageId, splitCodeResult, lineNumbers] = parseFunctions(
        fileUri.fsPath,
        fileContentsString);

    //now loop through the splitCodeResult and create a cell for each item,
    //  adding to an array of cells
    const cells = [];

    for (let i = 0; i < splitCodeResult.length; i++) {
        const cell = (targetNotebook instanceof boostnb.BoostNotebook)?
            new boostnb.BoostNotebookCell(boostnb.NotebookCellKind.Code, splitCodeResult[i], languageId, i.toString()) :
            new vscode.NotebookCellData(vscode.NotebookCellKind.Code, splitCodeResult[i], languageId);
        cell.metadata = {
            "id": i,
            "type": "originalCode",
                // if the lineNumbers info is not available (very unlikely, but defensive), then
                //   set the base to line number 0 in the file
                // otherwise, set the base to the line number BEFORE the line of this splitCell text
            "lineNumberBase": lineNumbers ? ((lineNumbers[i] < 0)?0:lineNumbers[i]) - 1 : 0
        };
        cells.push(cell);
    }

    // if we still failed to find an available Notebook, then warn and give up
    if (targetNotebook === undefined) {
        boostLogging.warn(
            'Missing open Boost Notebook. Please create or activate your Boost Notebook first');
        return;
    }

    // if the Notebook has unsaved changes, prompt user before erasing them
    if (targetNotebook.isDirty &&
            // if there are multiple cells, or
        (targetNotebook.cellCount > 1 ||
            // unless there's only one cell and its the default Instructions (e.g. not code)
        targetNotebook.cellCount === 1 && targetNotebook.cellAt(0).kind !== boostnb.NotebookCellKind.Markup )) {
        const choice = await vscode.window.showInformationMessage(
            "The default Boost Notebook has unsaved data in it. If you proceed, that data will likely be lost. " +
            "Do you wish to proceed?", { "modal": true}, 'Yes', 'No');
        if (choice !== 'Yes') {
            return;
        }
    }

    // get the range of the cells in the notebook
    const range = (!(targetNotebook instanceof boostnb.BoostNotebook))?
        new vscode.NotebookRange(0, targetNotebook.cellCount):undefined;
    const edit = (!(targetNotebook instanceof boostnb.BoostNotebook))?new vscode.WorkspaceEdit():undefined;

    const sourceFilePath = sourceFileFromFullPath(fileUri);
        
    let newMetadata = {
        ...targetNotebook.metadata,
        sourceFile: sourceFilePath};

    if (targetNotebook instanceof boostnb.BoostNotebook) {
        targetNotebook.replaceCells(cells as boostnb.BoostNotebookCell[]);
        targetNotebook.metadata = newMetadata;
    } else if (edit) {
        // Use .set to add one or more edits to the notebook
        edit.set(targetNotebook.uri, [
            // Create an edit that replaces all the cells in the notebook with new cells created from the file
            vscode.NotebookEdit.replaceCells(range as vscode.NotebookRange, cells as vscode.NotebookCellData[]),

            // Additional notebook edits...
        ]);

        // store the source file on the notebook metadata, so we can use it for problems or reverse mapping
        edit.set(targetNotebook.uri, [vscode.NotebookEdit.updateNotebookMetadata(newMetadata)]);
    } else {
        boostLogging.error('Unable to replace existing notebook - Type logic error', true);
    }
    // only use workspace editor if we are using vscode notebook
    if (!(targetNotebook instanceof boostnb.BoostNotebook)) {
        await vscode.workspace.applyEdit(edit as vscode.WorkspaceEdit);
    }
}

export function _syncProblemsInCell(
    cell: vscode.NotebookCell | boostnb.BoostNotebookCell,
    problems: vscode.DiagnosticCollection,
    cellsBeingRemoved : boolean = false) {

    const usingBoostNotebook = 'value' in cell;

    const cellUri = usingBoostNotebook?vscode.Uri.parse(cell.id as string):cell.document.uri;

    // if no problems for this cell, skip it
    const thisCellProblems = problems.get(cellUri);
    if (!thisCellProblems || thisCellProblems.length === 0) {
        return;
    }
    
    // Check if the cell has any error output
    const hasErrorOutput = cell.outputs.some((output : any) => {
        for (const item of output.items) {
            return item.mime === errorMimeType;
        }
    });
    // If the cell has error output, check if there are any problems associated with it

    // if the cell has no error output, remove all problems associated with it
    if (!hasErrorOutput) {
        problems.delete(cellUri);
        return;
    }
    const diagnostics: vscode.Diagnostic[] = [];
    // Loop through each problem and check if it can still be matched to an error output
    for (const problem of thisCellProblems) {
        const errorOutputIndex = cell.outputs.findIndex((output) => {
            for (const item of output.items) {
                return item.mime === errorMimeType;
                //    && output.metadata?.cellId === problem?.source?.toString();
            }
        });
        // Error output found for the problem, add it back to the diagnostics
        // unless the cell is being removed, in which case, we'll drop it (e.g. skip the re-add)
        if (errorOutputIndex !== -1 && !cellsBeingRemoved) {
            diagnostics.push(problem);
        }
    }
    // Replace the problems with the updated diagnostics
    problems.set(cellUri, diagnostics);
}

export function newErrorFromItemData(data: Uint8Array): Error {
    const errorJson = new TextDecoder().decode(data);

    try {
        const errorObject = JSON.parse(errorJson, (key, value) => {
            if (key === '') {
                const error = new Error();
                Object.assign(error, value);
                return error;
            }
            return value;
        });

        return errorObject;
    } catch (SyntaxError) {
        return new Error(`${errorJson}`);
    }
}

export function getProjectName() : string {
    return path.basename(vscode.workspace.workspaceFolders![0].uri.fsPath);
}

export async function getAllProjectFiles(useRelativePaths : boolean = false) : Promise<string[]> {
    let baseWorkspace;
    if (vscode.workspace.workspaceFolders) {
        baseWorkspace = vscode.workspace.workspaceFolders![0].uri;
    } else {
        throw new Error("No workspace folders found");
    }

    const searchPattern = new vscode.RelativePattern(
        baseWorkspace.fsPath,
        "**/**"
    );
    const ignorePatterns = buildVSCodeIgnorePattern(baseWorkspace, true);
    const files = await vscode.workspace.findFiles(
        searchPattern, ignorePatterns );

    const paths : string[] = [];
    files.forEach((file) => {
        if (!useRelativePaths) {
            paths.push(file.fsPath);
            return;
        }

        const relativePath = vscode.workspace.asRelativePath(file);
        paths.push(relativePath);
    });
    return paths;
}

function getBoostIgnoreFile() : vscode.Uri | undefined {
    const workspaceFolder : vscode.Uri | undefined = vscode.workspace.workspaceFolders?.[0]?.uri;

    // if no workspace root folder, bail
    if (!workspaceFolder) {
        return undefined;
    }

    // path to the the .boostignore file
    const boostignoreFile = vscode.Uri.joinPath(workspaceFolder, ".boostignore");
    return boostignoreFile;
}

export function updateBoostIgnoreForTarget(targetFilepath: string, absolutePath: boolean = true) {
    const boostignoreFile = getBoostIgnoreFile();
    if (!boostignoreFile) {
        return;
    }

    let patterns = _extractIgnorePatternsFromFile(boostignoreFile.fsPath);

    // Convert path to relative path
    let targetRelativePath : string;
    if (absolutePath) {
        targetRelativePath = vscode.workspace.asRelativePath(vscode.Uri.parse(targetFilepath), false);
    } else {
        targetRelativePath = targetFilepath;
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
        targetFilepath = vscode.Uri.joinPath(workspaceRoot as vscode.Uri, targetFilepath).fsPath;
    }

    if (!fs.existsSync(targetFilepath)) {
        boostLogging.warn(`Unable to determine info of file: ${targetFilepath}`, false);
        return;
    }
    // search if the new target is already excluded in the existing patterns
    else if (patterns.some(pattern => micromatch.isMatch(targetRelativePath, pattern))) {
        boostLogging.warn(`${targetRelativePath} is already excluded in ${boostignoreFile.fsPath}`, false);
        return;
    }

    // otherwise need to exclude the target in the ignore file
    // Check if the target is a directory or a file
    const stats = fs.statSync(targetFilepath);
    if (stats.isDirectory()) {
        patterns.push(targetRelativePath + '/**'); // Add glob to match all files/folders under the directory
    } else if (stats.isFile()) {
        patterns.push(targetRelativePath); // If it's a file, just add the file path
    }

    fs.writeFileSync(boostignoreFile.fsPath, patterns.join('\n'));

    boostLogging.info(`${targetRelativePath} has been added to ${boostignoreFile.fsPath}`, false);
}

export function buildVSCodeIgnorePattern(
    targetFolder: vscode.Uri,
    ignoreBoostFolder: boolean = true): vscode.RelativePattern | null {

    let workspaceFolder : vscode.Uri | undefined = vscode.workspace.workspaceFolders?.[0]?.uri;
    // if no workspace root folder, bail
    if (!workspaceFolder) {
        return null;
    }

    const patterns : string[] = [];

    // read the .vscodeignore file
    let vscignoreFile = vscode.Uri.joinPath(workspaceFolder, ".vscodeignore");
    const vscodeIgnorePatterns = _extractIgnorePatternsFromFile(vscignoreFile.fsPath);
    patterns.push(...vscodeIgnorePatterns);

    // read the .gitignore file
    let gitignoreFile = vscode.Uri.joinPath(workspaceFolder, ".gitignore");
    const gitIgnorePatterns = _extractIgnorePatternsFromFile(gitignoreFile.fsPath);
    patterns.push(...gitIgnorePatterns);

    const boostIgnoreFile = getBoostIgnoreFile();
    if (!boostIgnoreFile) {
        return null;
    }
    patterns.push(...patterns.concat(_extractIgnorePatternsFromFile(boostIgnoreFile.fsPath)));

    // never include the .boost folder - since that's where we store our notebooks
    if (ignoreBoostFolder && !patterns.find((pattern) => pattern === '**/.boost/**')) {
        patterns.push('**/.boost/**');
    } else if (!ignoreBoostFolder) {
        patterns.splice(patterns.indexOf('**/.boost/**'), 1);
    }

    // never include the .boostignore file since that's where we store our ignore patterns
    if (!patterns.find((pattern) => pattern === '**/.boostignore')) {
        patterns.push('**/.boostignore');
    }
    // add common binary file types to the exclude patterns
    const binaryFilePatterns = [
        '**/*.jpg',
        '**/*.jpeg',
        '**/*.png',
        '**/*.gif',
        '**/*.bmp',
        '**/*.tiff',
        '**/*.ico',
        '**/*.pdf',
        '**/*.zip',
        '**/*.tar',
        '**/*.gz',
        '**/*.rar',
        '**/*.7z',
        '**/*.exe',
        '**/*.dll',
        '**/*.so',
        '**/*.bin',
        '**/*.ppt',
        '**/*.pptx',
        '**/*.doc',
        '**/*.docx',
        '**/*.xls',
        '**/*.xlsx',
        '**/*.psd',
        '**/*.ai',
        '**/*.flv',
        '**/*.mp4',
        '**/*.avi',
        '**/*.mkv',
        '**/*.mpeg',
        '**/*.mp3',
        '**/*.wav',
        '**/*.flac',
        '**/*.aac',
        '**/*.ogg',
        '**/*.iso',
        '**/*.dmg',
        '**/*.jar',
        '**/*.war',
        '**/*.ear',
        '**/*.pyc',
        '**/*.pyo',
        '**/*.class',
        '**/*.sqlite',
        '**/*.db',
        '**/*.ttf',
        '**/*.otf',
        '**/*.ipynb_checkpoints',
        '**/*.ipynb_checkpoints/**',
        '**/*.git',
        '**/*.svn',
        '**/*.hg',
        '**/*.bz2',
        '**/*.app',
        '**/*.appx',
        '**/*.appxbundle',
        '**/*.msi',
        '**/*.deb',
        '**/*.rpm',
        '**/*.elf',
        '**/*.sys',
        '**/*.odt',
        '**/*.ods',
        '**/*.odp',
    ];

    const textFilePatterns = [
        '**/*.svg',
        '**/*.*ignore',
        '**/*.gitignore',
        '**/*.gitattributes',
        '**/*.log',
        '**/*.out',
        '**/*.dockerignore',
        '**/*.gitkeep',
        '**/*.gitmodules',
        '**/*.gitconfig',
    ];          

    const potentiallyUsefulTextFiles = [
        '**/*.ipynb',   // Jupyter notebooks
        '**/*.sql',     // SQL scripts
        '**/*.rtf',     // Rich text files
        '**/*.csv',     // Data files that might be read by scripts
        '**/*.tsv',     // Data files that might be read by scripts
        '**/*.dist',    // Often used for distribution config files
    ];          

    patterns.push(...binaryFilePatterns, ...textFilePatterns, ...potentiallyUsefulTextFiles);    
  
    // const exclude = '{**/node_modules/**,**/bower_components/**}';
    const ignorePatterns = "{" + patterns.join(',') + "}";
//    boostLogging.debug( "Skipping source files of pattern: " + (ignorePatterns ?? "none") );

    return new vscode.RelativePattern(targetFolder, ignorePatterns);
}

function _extractIgnorePatternsFromFile(ignoreFile : string) : string[] {
    // if no ignore file, bail
    if (!fs.existsSync(ignoreFile)) {
        return [];
    }

    const ignoreFileContent = fs.readFileSync(ignoreFile, 'utf-8');
    const patterns = ignoreFileContent.split(/\r?\n/).filter((line) => {
      return line.trim() !== '' && !line.startsWith('#');
    });
    return patterns;
}

async function createEmptyNotebook(filename : vscode.Uri, useUINotebook : boolean) :
        Promise<vscode.NotebookDocument | boostnb.BoostNotebook> {

    // if no UI, then create BoostNotebook directly and return it
    if (!useUINotebook) {
        const boostNb = new boostnb.BoostNotebook();
        boostNb.metadata = {
            defaultDir : BoostConfiguration.defaultDir,
            sourceFile : './'
        };
        return boostNb;
    }

    // otherwise, create a VSC notebook document and return it
    const notebookData: vscode.NotebookData = {
        metadata: {
            defaultDir : BoostConfiguration.defaultDir,
            sourceFile : './'
        },
        cells: []
    };
    const dummmyToken = new vscode.CancellationTokenSource().token;

    const notebookBlob = await (new BoostContentSerializer()).serializeNotebook(notebookData, dummmyToken);
    fs.writeFileSync(filename.fsPath, notebookBlob);

    const newNotebook = await vscode.workspace.openNotebookDocument(filename);

    return newNotebook;
}

export function sourceFileFromFullPath(fileUri: vscode.Uri) : string {
    // we need to write the relativePath to the workspace into the notebook, so the source path isn't local to the system
    // if there is a workspace... otherwise, we just write it as is
    let baseFolder : string;
    let sourceFilePath = fileUri.fsPath;
    if (vscode.workspace.workspaceFolders) {
        const workspaceFolder = vscode.workspace.workspaceFolders[0]; // Get the first workspace folder
        baseFolder = workspaceFolder.uri.fsPath;
        const relativePath = path.relative(baseFolder, sourceFilePath);
        // just use full path if the file is outside our workspace
        if (!relativePath.startsWith('..')) {
            sourceFilePath = "./" + relativePath;
        }
    }
    return sourceFilePath;
}

export function fullPathFromSourceFile(sourceFile : string) : vscode.Uri {
    let baseFolder : string;
    let fullPath = sourceFile;
    if ( vscode.workspace.workspaceFolders) {
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

export function getOrCreateGuideline(projectGuidelineFile: vscode.Uri, guidelineType: any) : boolean{

    if (fs.existsSync(projectGuidelineFile.fsPath)) {
        return false;
    }
    const sampleGuideline = `# Enter Your ${guidelineType?guidelineType:"Project"} Guidelines Here\n\nYou can describe your goals, constraints, or hints for analysis`;

    const sampleGuidelineCell = new boostnb.BoostNotebookCell(boostnb.NotebookCellKind.Markup, "", "markdown");
    const notebookMetadata : any = {"id": sampleGuidelineCell.id};
    notebookMetadata["guidelineType"] = guidelineType?guidelineType:"Project";
    sampleGuidelineCell.initializeMetadata(notebookMetadata);
    sampleGuidelineCell.value = sampleGuideline;
    const newGuidelineNotebook = new boostnb.BoostNotebook();
    newGuidelineNotebook.addCell(sampleGuidelineCell);

    newGuidelineNotebook.save(projectGuidelineFile.fsPath);

    return true;
}

export async function getOrCreateBlueprintUri(context: vscode.ExtensionContext, filePath: string): Promise<vscode.Uri>{
    const workspacePath = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : '';
    const absoluteFilePath = path.resolve(workspacePath, filePath);
    const uri = vscode.Uri.file(absoluteFilePath);
    if (fs.existsSync(absoluteFilePath)) {
        const existingNotebook = new boostnb.BoostNotebook();
        existingNotebook.load(absoluteFilePath);
        // repair the sourceFile metadata if missing
        if (existingNotebook.metadata['sourceFile'] === undefined) {
            existingNotebook.updateMetadata('sourceFile', './');
            existingNotebook.flushToFS();
        }
        return uri;
    }

    // If the file doesn't exist, create it with data from blueprint_template.md
    const extensionPath = context.extensionPath;
    const templatePath = path.join(extensionPath, 'resources', 'blueprint_template.md');
    const normalizedTemplatePath = path.normalize(templatePath);
    const data = fs.readFileSync(normalizedTemplatePath, 'utf8');

    //filePath might point to a directory that does not exist yet. check for that and create it if necessary
    const folderPath = path.dirname(absoluteFilePath);
    fs.mkdirSync(folderPath, { recursive: true });

    // technically this cached markdown file is not a normal notebook file - and since the
    //  project summary is in a notebook form, we need to convert it into a new notebook with a Blueprint summary cell

    const newBlueprintSummaryNotebook : boostnb.BoostNotebook = await createEmptyNotebook(uri, false) as boostnb.BoostNotebook;
    newBlueprintSummaryNotebook.updateMetadata('sourceFile', './');

    const newBlueprintCell = new boostnb.BoostNotebookCell(boostnb.NotebookCellKind.Markup, "", "markdown");
    newBlueprintCell.initializeMetadata({"id": newBlueprintCell.id, "outputType": ControllerOutputType.blueprint});
    newBlueprintCell.value = data;
    newBlueprintSummaryNotebook.addCell(newBlueprintCell);
    newBlueprintSummaryNotebook.save(uri.fsPath);

    return uri;
}

export function cleanCellOutput(input: string): string {
    // strip out timestamps from the input
    // ### Boost Code Compliance Check Summary
    // Last Updated: Friday, June 16, 2023 at 8:24:17 PM PDT

    // use regex to remove the above info
    var pattern = /\n\n---\n\n### Boost [^\n]*\n\nLast Updated: [^\n]*\n\n/g;
    const cleanedInput = input.replace(pattern, "");
    return cleanedInput;
}

export function generateCellOutputWithHeader(analysisType: string, analysisResults: string): string {
    return `\n\n---\n\n### Boost ${analysisType}\n\nLast Updated: ${getCurrentDateTime()}\n\n${analysisResults}`;
}

export function getCurrentDateTime(): string {
    return new Date().toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "numeric",
        second: "numeric",
        timeZoneName: "short",
    });
}