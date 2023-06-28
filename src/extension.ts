import * as vscode from 'vscode';

import * as fs from 'fs';
import * as path from 'path';
import * as boostnb from './jupyter_notebook';

import { BoostContentSerializer } from './serializer';
import { parseFunctions } from './split';
import { BoostConfiguration } from './boostConfiguration';
import { boostLogging } from './boostLogging';
import { TextDecoder } from 'util';
import { PROJECT_EXTENSION } from './BoostProjectData';
import { BoostExtension } from './BoostExtension';
import { errorMimeType } from './base_controller';


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

    buildCurrentFileOutput = "buildCurrentFileOutput",
    buildCurrentFileSummaryOutput = "buildCurrentFileSummaryOutput",
    buildCurrentFolderOutput = "buildCurrentFolderOutput",
    buildCurrentFolderSummaryOutput = "buildCurrentFolderSummaryOutput",
    showCurrentFileAnalysisOutput = "showCurrentFileAnalysisOutput",
    showCurrentFileAnalysisSummaryOutput = "showCurrentFileAnalysisSummaryOutput",
    showCurrentFolderAnalysisSummaryOutput = "showCurrentFolderAnalysisSummaryOutput",

    analyzeSourceCode = "analyzeSourceCode",

    refreshProjectData = "refreshProjectData",
}

export async function activate(context: vscode.ExtensionContext) {
    try {
        // we use a friendly name for the channel as this will be displayed to the user in the output pane
        boostLogging.log('Activating Boost Notebook Extension');

        const extension = new BoostExtension(context);

        await extension.refreshBoostProjectsData();

    } catch (error) {
        boostLogging.error(`Unable to activate Boost Notebook Extension due to error:${error}. Please retry launching, check your Boost configuration, or contact Polyverse Boost Support`);
    }
}

// for completeness, we provide a deactivate function - asynchronous return
//    if we have resources to cleanup in the future
export async function deactivate(): Promise<void> {
    const outputChannel = vscode.window.createOutputChannel(boostnb.NOTEBOOK_TYPE);

    outputChannel.appendLine('Deactivating Boost Notebook Extension');
  
    return undefined;
}

export function getBoostFile(sourceFile : vscode.Uri, format : BoostFileType = BoostFileType.notebook, showUI : boolean = false) : vscode.Uri {

    // if we don't have a workspace folder, just place the Boost file in a new Boostdir - next to the source file
    let baseFolder;
    if (!vscode.workspace.workspaceFolders) {
        baseFolder = path.dirname(sourceFile.fsPath);
    }
    else {
        const workspaceFolder = vscode.workspace.workspaceFolders[0]; // Get the first workspace folder
        baseFolder = workspaceFolder.uri.fsPath;
    }
    // create the .boost folder if we need to - this is statically located in the workspace folder no matter which child folder is processed
    const boostFolder = path.join(baseFolder, BoostConfiguration.defaultDir);
    fs.mkdirSync(boostFolder, { recursive: true });

    // get the distance from the workspace folder for the source file
            // for project-level status files, we ignore the relative path
    let relativePath = (baseFolder === sourceFile.path)?
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
                return vscode.Uri.file(absoluteBoostNotebookFile);
            }
        case BoostFileType.status:
            const absoluteboostProjectDataFile = path.join(boostFolder, relativePath + PROJECT_EXTENSION);
            let boostProjectDataFile = vscode.Uri.file(absoluteboostProjectDataFile);
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
                return vscode.Uri.file(absoluteBoostNotebookFile);
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
        const newNotebook = await createEmptyNotebook(notebookSummaryPath, true) as boostnb.BoostNotebook;

        const sourceFilePath = sourceFileFromFullPath(sourceFile);

        let newMetadata = {
            ...newNotebook.metadata,
            sourceFile: sourceFilePath};

        newNotebook.metadata = newMetadata;

        // boost notebook needs to be saved explicitly - while the VSC notebook background saves
        newNotebook.save(notebookSummaryPath.path);
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

    if (BoostConfiguration.processFoldersInASingleNotebook) {
        if (!existingNotebook) {
            if (useBoostNotebookWithNoUI) {
                newNotebook = new boostnb.BoostNotebook();
            } else {
                newNotebook = await vscode.workspace.openNotebookDocument(boostnb.NOTEBOOK_TYPE, new vscode.NotebookData([]));
            }
        } else {
            newNotebook = existingNotebook;
        }
    } else {
        newNotebook = await createEmptyNotebook(notebookPath, useBoostNotebookWithNoUI);
    }

    // load/parse source file into new notebook
    await parseFunctionsFromFile(sourceFile, newNotebook, BoostConfiguration.processFoldersInASingleNotebook);

    if (!BoostConfiguration.processFoldersInASingleNotebook) {
        if (useBoostNotebookWithNoUI) {
            newNotebook.save(notebookPath.path);
        } else {
            // Save the notebook to disk
            const notebookData = await (new BoostContentSerializer()).serializeNotebookFromDoc(newNotebook as vscode.NotebookDocument);
            await vscode.workspace.fs.writeFile(notebookPath, notebookData);
        }
    } else if (useBoostNotebookWithNoUI) {
        newNotebook.save(notebookPath.path);
    }
    return newNotebook;
}

export async function parseFunctionsFromFile(
    fileUri : vscode.Uri,
    targetNotebook : boostnb.BoostNotebook | vscode.NotebookDocument,
    appendToExistingNotebook : boolean = false) {

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
            "lineNumberBase": lineNumbers ? lineNumbers[i] - 1 : 0
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
    if (!appendToExistingNotebook &&
        targetNotebook.isDirty &&
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

    if (appendToExistingNotebook) {
        if (targetNotebook instanceof boostnb.BoostNotebook) {
            targetNotebook.appendCells(cells as boostnb.BoostNotebookCell[]);
        } else if (edit) {
            // Use .set to add one or more edits to the notebook
            edit.set(targetNotebook.uri, [
                // Create an edit that replaces all the cells in the notebook with new cells created from the file
                vscode.NotebookEdit.insertCells(targetNotebook.cellCount, cells as vscode.NotebookCellData[]),

                // Additional notebook edits...
            ]);
        } else {
            boostLogging.error('Unable to append to existing notebook - Type logic error');
        }
    } else {
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
            boostLogging.error('Unable to replace existing notebook - Type logic error');
        }
    }
    // only use workspace editor if we are using vscode notebook
    if (!(targetNotebook instanceof boostnb.BoostNotebook)) {
        await vscode.workspace.applyEdit(edit as vscode.WorkspaceEdit);
    }
}

export function _syncProblemsInCell(
    cell: vscode.NotebookCell,
    problems: vscode.DiagnosticCollection,
    cellsBeingRemoved : boolean = false) {
    const cellUri = cell.document.uri;

    
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

export function newErrorFromItemData(data: Uint8Array) : Error {
    const errorJson = new TextDecoder().decode(data);

    const errorObject = JSON.parse(errorJson, (key, value) => {
      if (key === '') {
        const error = new Error();
        Object.assign(error, value);
        return error;
      }
      return value;
    });
    
    return errorObject;
}

export async function _buildVSCodeIgnorePattern(ignoreBoostFolder: boolean = true): Promise<string | undefined> {
    let workspaceFolder : vscode.Uri | undefined = vscode.workspace.workspaceFolders?.[0]?.uri;
    // if no workspace root folder, bail
    if (!workspaceFolder) {
        return undefined;
    }

    // read the .vscodeignore file
    let vscignoreFile = vscode.Uri.joinPath(workspaceFolder, ".vscodeignore");
    let patterns = await _extractIgnorePatternsFromFile(vscignoreFile.fsPath);

    // add the contents of the .boostignore file
    let boostignoreFile = vscode.Uri.joinPath(workspaceFolder, ".boostignore");
    patterns = patterns.concat(await _extractIgnorePatternsFromFile(boostignoreFile.fsPath));

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
        '**/*.bin'
    ];
    patterns = patterns.concat(binaryFilePatterns);    
  
    // const exclude = '{**/node_modules/**,**/bower_components/**}';
    const excludePatterns = "{" + patterns.join(',') + "}";
    return excludePatterns;
}

async function _extractIgnorePatternsFromFile(ignoreFile : string) : Promise<string[]> {
    // if no ignore file, bail
    if (!fs.existsSync(ignoreFile)) {
        return [];
    }

    const data = await fs.promises.readFile(ignoreFile);
    const patterns = data.toString().split(/\r?\n/).filter((line) => {
      return line.trim() !== '' && !line.startsWith('#');
    });
    return patterns;
}

async function createEmptyNotebook(filename : vscode.Uri, useBoostNotebookWithNoUI : boolean) :
        Promise<vscode.NotebookDocument | boostnb.BoostNotebook> {

    // if no UI, then create BoostNotebook directly and return it
    if (useBoostNotebookWithNoUI) {
        const boostNb = new boostnb.BoostNotebook();
        boostNb.metadata = { defaultDir : BoostConfiguration.defaultDir};
        return boostNb;
    }

    // otherwise, create a VSC notebook document and return it
    const notebookData: vscode.NotebookData = {
        metadata: { defaultDir : BoostConfiguration.defaultDir},
        cells: []
    };
    const dummmyToken = new vscode.CancellationTokenSource().token;

    const notebookBlob = await (new BoostContentSerializer()).serializeNotebook(notebookData, dummmyToken);
    await vscode.workspace.fs.writeFile(filename, notebookBlob);

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
        }
    }
    return vscode.Uri.parse(fullPath);
}

export async function getOrCreateBlueprintUri(context: vscode.ExtensionContext, filePath: string): Promise<vscode.Uri>{
    const workspacePath = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : '';
    const absoluteFilePath = path.resolve(workspacePath, filePath);
    const uri = vscode.Uri.file(absoluteFilePath);
    if (!fs.existsSync(absoluteFilePath)) {
        // If the file doesn't exist, create it with data from blueprint_template.md
        const extensionPath = context.extensionPath;
        const templatePath = path.join(extensionPath, 'resources', 'blueprint_template.md');
        const data = fs.readFileSync(templatePath);
        //filePath might point to a directory that does not exist yet. check for that and create it if necessary
        const folderPath = path.dirname(absoluteFilePath);
        fs.mkdirSync(folderPath, { recursive: true });
        fs.writeFileSync(absoluteFilePath, data);
    }
    return uri;
}

export function cleanCellOutput(input: string): string {
    // strip out timestamps from the input
    // ### Boost Code Compliance Check Summary
    // Last Updated: Friday, June 16, 2023 at 8:24:17 PM PDT

    // use regex to remove the above info
    var pattern = /\n\n### Boost [^\n]*\n\nLast Updated: [^\n]*\n\n/g;
    const cleanedInput = input.replace(pattern, "");
    return cleanedInput;
}
