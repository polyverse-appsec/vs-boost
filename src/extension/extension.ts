import * as vscode from "vscode";

import * as fs from "fs";
import * as path from "path";

import * as boostnb from "../data/jupyter_notebook";

import { BoostContentSerializer } from "../utilities/serializer";
import { errorToString } from "../utilities/error";
import { parseFunctions } from "../utilities/sourceLoader";
import { BoostConfiguration } from "./boostConfiguration";
import { boostLogging, activateLogging } from "../utilities/boostLogging";
import { TextDecoder } from "util";
import { PROJECT_EXTENSION } from "../data/BoostProjectData";
import { BoostExtension } from "./BoostExtension";
import { ControllerOutputType } from "../controllers/controllerOutputTypes";
import { setExtensionMode } from "./extension_state";

export enum BoostFileType {
    notebook = "notebook",
    summary = "summary",
    status = "status",
    guidelines = "guidelines",
    output = "output",
    chat = "chat",
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
    analyzeOnlyTargetForBoostAnalysis = "analyzeOnlyTargetForBoostAnalysis",
    analyzeOnlyTargetFolderForBoostAnalysis = "analyzeOnlyTargetFolderForBoostAnalysis",

    analyzeSourceCode = "analyzeSourceCode",
    analysisSummaryForSourceCode = "analysisSummaryForSourceCode",

    refreshProjectData = "refreshProjectData",
    cleanBoostFiles = "cleanBoostFiles",

    showGuidelines = "showGuidelines",

    customerPortal = "customerPortal",
    selectOrganization = "selectOrganization",
    setOrganization = "setOrganization",
}

export interface ProcessCurrentFolderOptions {
    uri?: vscode.Uri;
    kernelCommand?: string;
    forceAnalysisRefresh?: boolean;
    filelist?: vscode.Uri[];
    fileLimit?: number;
}

export async function activate(context: vscode.ExtensionContext) {
    try {
        activateLogging(context);
        // we use a friendly name for the channel as this will be displayed to the user in the output pane
        boostLogging.log("Activating Boost Notebook Extension");

        setExtensionMode(context.extensionMode);
        const extension = new BoostExtension(context);
    } catch (error) {
        boostLogging.error(
            `Unable to activate Boost Notebook Extension due to error:${errorToString(error)}. Please retry launching, check your Boost configuration, or contact Polyverse Boost Support`,
            true
        );
    }
}

// for completeness, we provide a deactivate function - asynchronous return
//    if we have resources to cleanup in the future
export async function deactivate(): Promise<void> {
    const outputChannel = vscode.window.createOutputChannel(
        boostnb.NOTEBOOK_TYPE
    );

    outputChannel.appendLine("Deactivating Boost Notebook Extension");

    return undefined;
}

export enum OutputType {
    pdf = "pdf",
    markdown = "md",
    html = "html"
}

export interface BoostFileOptions {
    format?: BoostFileType;
    showUI?: boolean;
    outputType?: OutputType;
}

export function getBoostFile(
    sourceFile: vscode.Uri | undefined,
    options?: BoostFileOptions,
): vscode.Uri {
    // if we don't have a workspace folder, just place the Boost file in a new Boostdir - next to the source file
    let baseFolder;
    if (!vscode.workspace.workspaceFolders) {
        if (!sourceFile) {
            throw new Error("Unable to determine source file for Boost file");
        }
        baseFolder = path.dirname(sourceFile.fsPath);
    } else {
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
    const nonNormalizedBoostFolder = path.join(
        baseFolder,
        BoostConfiguration.defaultDir
    );
    const boostFolder = path.normalize(nonNormalizedBoostFolder);
    if (!fs.existsSync(boostFolder)) {
        try {
            fs.mkdirSync(boostFolder, { recursive: true });
        } catch (error) {
            throw new Error(
                `Failed to create Boost folder at ${boostFolder} due to Error: ${errorToString(error)} - possible permission issue`
            );
        }
    }

    // if the source file is an output file, then we're going to use the original source file instead
    const outputUri = vscode.Uri.joinPath(vscode.Uri.parse(boostFolder), BoostFileType.output.toString());
    if (sourceFile.fsPath.includes(outputUri.fsPath)) {
        const relativeToOutput = path.relative(outputUri.fsPath, sourceFile.fsPath);

        // Split the path into its components
        let pathSegments = relativeToOutput.split(path.sep);

        // Remove the second segment (i.e., 'foo')
        pathSegments.splice(0, 1);

        // Modify the last segment to remove the file extension
        pathSegments[pathSegments.length - 1] = path.basename(pathSegments[pathSegments.length - 1], path.extname(pathSegments[pathSegments.length - 1]));

        // Rejoin the segments to get the new path
        let newPath = pathSegments.join(path.sep);

        sourceFile = vscode.Uri.joinPath(vscode.Uri.parse(baseFolder), newPath);
    }

    // get the distance from the workspace folder for the source file
    // for project-level status files, we ignore the relative path
    let relativePath =
        baseFolder === sourceFile.fsPath
            ? path.basename(baseFolder)
            : path.relative(baseFolder, sourceFile.fsPath);

    const format = options?.format?options.format:BoostFileType.notebook;
    const showUI = options?.showUI?options.showUI:false;

    // create the .boost file path, from the new boost folder + amended relative source file path
    switch (format) {
        case BoostFileType.summary:
        case BoostFileType.guidelines:
            // default to summary
            let extension = boostnb.NOTEBOOK_SUMMARY_EXTENSION;
            if (format === BoostFileType.guidelines) {
                extension = boostnb.NOTEBOOK_GUIDELINES_EXTENSION;
            }
            // if we are already looking at the file, just return it
            if (sourceFile.fsPath.endsWith(extension)) {
                return sourceFile;

                // if we were given a notebook, and we are looking for guidelines or summary, then return same path with new extension
            } else if (sourceFile.fsPath.endsWith(boostnb.NOTEBOOK_EXTENSION)) {
                return vscode.Uri.parse(sourceFile.fsPath.slice(0, boostnb.NOTEBOOK_EXTENSION.length * -1) + extension);
            }

            // if the new file is outside of our current workspace, then warn user
            // and place the new .boost file next to it (not great, but better than nothing)
            if (relativePath.startsWith("..")) {
                boostLogging.warn(
                    `Boost Notebook file ${sourceFile.fsPath} is outside of current workspace ${baseFolder}`,
                    showUI
                );
                const externalBoostFile = sourceFile.fsPath + extension;
                return vscode.Uri.file(externalBoostFile);
            } else {
                // if we're targeting a folder, and the folder is the workspace name, then name it after the project
                if (!relativePath) {
                    relativePath = path.basename(baseFolder);
                }
                // create the .boost file path, from the new boost folder + amended relative source file path
                const absoluteBoostNotebookFile = path.join(
                    boostFolder,
                    relativePath + extension
                );
                const normalizedAbsoluteBoostNotebookFile = path.normalize(
                    absoluteBoostNotebookFile
                );

                return vscode.Uri.file(normalizedAbsoluteBoostNotebookFile);
            }
        case BoostFileType.chat:
            const chatFolder = path.join(
                boostFolder,
                BoostFileType.chat.toString()
            );
            const absoluteChatFile = path.join(
                chatFolder,
                relativePath + ".json"
            );
            const normalizedAbsoluteChatFile = path.normalize(
                absoluteChatFile
            );

            let chatFile = vscode.Uri.file(
                normalizedAbsoluteChatFile
            );
            // create chat folder if not found
            if (!fs.existsSync(chatFolder)) {
                try {
                    fs.mkdirSync(chatFolder, { recursive: true });
                } catch (error) {
                    throw new Error(
                        `Failed to create Boost Chat folder at ${chatFolder} due to Error: ${errorToString(error)} - possible permission issue`
                    );
                }
            }
            return chatFile;
        case BoostFileType.status:
            const absoluteboostProjectDataFile = path.join(
                boostFolder,
                relativePath + PROJECT_EXTENSION
            );
            const normalizedAbsoluteBoostProjectDataFile = path.normalize(
                absoluteboostProjectDataFile
            );

            let boostProjectDataFile = vscode.Uri.file(
                normalizedAbsoluteBoostProjectDataFile
            );
            return boostProjectDataFile;
        case BoostFileType.output:
            const isNotebook = path.extname(sourceFile.fsPath) === boostnb.NOTEBOOK_EXTENSION;

            // grab the requested output format, or the default format from config or markdown if not specified
            const outputType = options?.outputType?options.outputType:
                OutputType[BoostConfiguration.defaultOutputFormat as keyof typeof OutputType] || OutputType.markdown;
            
            const nonNormalizedOutputFolder = path.join(path.join(boostFolder, BoostFileType.output.toString()), outputType);
            const outputFolder = path.normalize(nonNormalizedOutputFolder);
            if (!fs.existsSync(outputFolder)) {
                try {
                    fs.mkdirSync(outputFolder, { recursive: true });
                } catch (error) {
                    throw new Error(
                        `Failed to create Boost Output folder at ${outputFolder} due to Error: ${errorToString(error)} - possible permission issue`
                    );
                }
            }
        
            let sourceFilePathRelative = path.relative(baseFolder, sourceFile.fsPath);
            if (isNotebook) {
                const dirName = path.dirname(sourceFile.path);
                let baseNameWithoutExt = path.basename(sourceFile.path, path.extname(sourceFile.path));

                const nonNormalizedSourceFilePathUnderBoost = path.join(dirName, baseNameWithoutExt);
                const sourceFilePathUnderBoost = path.normalize(nonNormalizedSourceFilePathUnderBoost);
                sourceFilePathRelative = path.relative(boostFolder, sourceFilePathUnderBoost);
            }

            const nonNormalizedOutputFilePath = path.join(outputFolder, sourceFilePathRelative) + "." + outputType;
            const outputFilePath = path.normalize(nonNormalizedOutputFilePath);

            // proactively create the output sub-folder if it doesn't exist, so we can write it
            const outputFileParentFolder = path.dirname(outputFilePath);
            if (!fs.existsSync(outputFileParentFolder)) {
                fs.mkdirSync(outputFileParentFolder, { recursive: true });
            }
            
            return vscode.Uri.parse(outputFilePath);

        case BoostFileType.notebook:
        default:

            // if the new file is outside of our current workspace, then warn user
            // and place the new .boost file next to it (not great, but better than nothing)
            if (relativePath.startsWith("..")) {
                boostLogging.warn(
                    `Boost Notebook file ${sourceFile.fsPath} is outside of current workspace ${baseFolder}`,
                    showUI
                );
                const externalBoostFile =
                    sourceFile.fsPath + boostnb.NOTEBOOK_EXTENSION;
                return vscode.Uri.file(externalBoostFile);
            } else {
                // if we're targeting a folder, and the folder is the workspace name, then name it after the project
                if (!relativePath) {
                    relativePath = path.basename(baseFolder);
                }
                // create the .boost file path, from the new boost folder + amended relative source file path
                const absoluteBoostNotebookFile = path.join(
                    boostFolder,
                    relativePath + boostnb.NOTEBOOK_EXTENSION
                );
                const normalizedAbsoluteBoostNotebookFile = path.normalize(
                    absoluteBoostNotebookFile
                );

                return vscode.Uri.file(normalizedAbsoluteBoostNotebookFile);
            }
    }
}

export function findCellByKernel(
    targetNotebook: vscode.NotebookDocument | boostnb.BoostNotebook,
    outputType: string
): vscode.NotebookCell | boostnb.BoostNotebookCell | undefined {
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

export async function createOrOpenSummaryNotebookFromSourceFile(
    sourceFile: vscode.Uri
): Promise<boostnb.BoostNotebook> {
    const notebookSummaryPath = getBoostFile(sourceFile, { format: BoostFileType.summary} );
    const summaryFileExists = fs.existsSync(notebookSummaryPath.fsPath);
    // if doesn't exist, create it
    if (!summaryFileExists) {
        const newNotebook = (await createEmptyNotebook(
            notebookSummaryPath,
            false
        )) as boostnb.BoostNotebook;

        const sourceFilePath = sourceFileFromFullPath(sourceFile);

        let newMetadata = {
            ...newNotebook.metadata,
            sourceFile: sourceFilePath,
        };

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
    sourceFile: vscode.Uri,
    useBoostNotebookWithNoUI: boolean,
    overwriteIfExists: boolean = false,
    existingNotebook:
        | vscode.NotebookDocument
        | boostnb.BoostNotebook
        | undefined = undefined
): Promise<vscode.NotebookDocument | boostnb.BoostNotebook> {
    let newNotebook: vscode.NotebookDocument | boostnb.BoostNotebook;
    const notebookPath = getBoostFile(sourceFile);
    const fileExists = fs.existsSync(notebookPath.fsPath);
    if (fileExists) {
        // if the file exists, but has no outputs or analysis in it, then we're going to re-parse it
        //  by default (e.g. in case the source has changed)
        newNotebook = new boostnb.BoostNotebook();
        newNotebook.load(notebookPath.fsPath);
        if (!newNotebook.isEmpty()) {
            if (!useBoostNotebookWithNoUI) {
                newNotebook = await vscode.workspace.openNotebookDocument(
                    notebookPath
                );
            }
            return newNotebook;
        } else {
            boostLogging.debug(
                `Boost File exists but appears empty of analysis, so rebuilding: ${notebookPath.fsPath}`
            );
        }
    }

    boostLogging.debug(
        `Boosting file: ${sourceFile.fsPath} as ${notebookPath.fsPath}`
    );
    newNotebook = await createEmptyNotebook(
        notebookPath,
        !useBoostNotebookWithNoUI
    );

    // load/parse source file into new notebook
    await parseFunctionsFromFile(sourceFile, newNotebook);

    if (useBoostNotebookWithNoUI) {
        newNotebook.save(notebookPath.fsPath);
    } else {
        // Save the notebook to disk
        const notebookData =
            await new BoostContentSerializer().serializeNotebookFromDoc(
                newNotebook as vscode.NotebookDocument
            );
        fs.writeFileSync(notebookPath.fsPath, notebookData);
    }
    return newNotebook;
}

export async function parseFunctionsFromFile(
    fileUri: vscode.Uri,
    targetNotebook: boostnb.BoostNotebook | vscode.NotebookDocument
) {
    const fileContents = fs.readFileSync(fileUri.fsPath, "utf8");

    // turn fileContents into a string and call splitCode
    const fileContentsString = fileContents.toString();
    const [languageId, splitCodeResult, lineNumbers] = parseFunctions(
        fileUri.fsPath,
        fileContentsString
    );

    //now loop through the splitCodeResult and create a cell for each item,
    //  adding to an array of cells
    const cells = [];

    for (let i = 0; i < splitCodeResult.length; i++) {
        const cell =
            targetNotebook instanceof boostnb.BoostNotebook
                ? new boostnb.BoostNotebookCell(
                      boostnb.NotebookCellKind.Code,
                      splitCodeResult[i],
                      languageId,
                      i.toString()
                  )
                : new vscode.NotebookCellData(
                      vscode.NotebookCellKind.Code,
                      splitCodeResult[i],
                      languageId
                  );
        cell.metadata = {
            id: i,
            type: "originalCode",
            // if the lineNumbers info is not available (very unlikely, but defensive), then
            //   set the base to line number 0 in the file
            // otherwise, set the base to the line number BEFORE the line of this splitCell text
            lineNumberBase: lineNumbers
                ? (lineNumbers[i] < 0 ? 0 : lineNumbers[i]) - 1
                : 0,
        };
        cells.push(cell);
    }

    // if we still failed to find an available Notebook, then warn and give up
    if (targetNotebook === undefined) {
        boostLogging.warn(
            "Missing open Boost Notebook. Please create or activate your Boost Notebook first"
        );
        return;
    }

    // if the Notebook has unsaved changes, prompt user before erasing them
    if (
        targetNotebook.isDirty &&
        // if there are multiple cells, or
        (targetNotebook.cellCount > 1 ||
            // unless there's only one cell and its the default Instructions (e.g. not code)
            (targetNotebook.cellCount === 1 &&
                targetNotebook.cellAt(0).kind !==
                    boostnb.NotebookCellKind.Markup))
    ) {
        const choice = await vscode.window.showInformationMessage(
            "The default Boost Notebook has unsaved data in it. If you proceed, that data will likely be lost. " +
                "Do you wish to proceed?",
            { modal: true },
            "Yes",
            "No"
        );
        if (choice !== "Yes") {
            return;
        }
    }

    // get the range of the cells in the notebook
    const range = !(targetNotebook instanceof boostnb.BoostNotebook)
        ? new vscode.NotebookRange(0, targetNotebook.cellCount)
        : undefined;
    const edit = !(targetNotebook instanceof boostnb.BoostNotebook)
        ? new vscode.WorkspaceEdit()
        : undefined;

    const sourceFilePath = sourceFileFromFullPath(fileUri);

    let newMetadata = {
        ...targetNotebook.metadata,
        sourceFile: sourceFilePath,
    };

    if (targetNotebook instanceof boostnb.BoostNotebook) {
        targetNotebook.replaceCells(cells as boostnb.BoostNotebookCell[]);
        targetNotebook.metadata = newMetadata;
    } else if (edit) {
        // Use .set to add one or more edits to the notebook
        edit.set(targetNotebook.uri, [
            // Create an edit that replaces all the cells in the notebook with new cells created from the file
            vscode.NotebookEdit.replaceCells(
                range as vscode.NotebookRange,
                cells as vscode.NotebookCellData[]
            ),

            // Additional notebook edits...
        ]);

        // store the source file on the notebook metadata, so we can use it for problems or reverse mapping
        edit.set(targetNotebook.uri, [
            vscode.NotebookEdit.updateNotebookMetadata(newMetadata),
        ]);
    } else {
        boostLogging.error(
            "Unable to replace existing notebook - Type logic error",
            true
        );
    }
    // only use workspace editor if we are using vscode notebook
    if (!(targetNotebook instanceof boostnb.BoostNotebook)) {
        await vscode.workspace.applyEdit(edit as vscode.WorkspaceEdit);
    }
}

export function newErrorFromItemData(data: Uint8Array): Error {
    const errorJson = new TextDecoder().decode(data);

    // workaround for malformed Error objects - from old convert_controller code
    if (errorJson.startsWith("Error: ")) {
        return new Error(errorJson);
    }

    const errorObject = JSON.parse(errorJson, (key, value) => {
        if (key === "") {
            const error = new Error();
            Object.assign(error, value);
            return error;
        }
        return value;
    });

    return errorObject;
}

export function getProjectName(): string {
    return path.basename(vscode.workspace.workspaceFolders![0].uri.fsPath);
}

async function createEmptyNotebook(
    filename: vscode.Uri,
    useUINotebook: boolean
): Promise<vscode.NotebookDocument | boostnb.BoostNotebook> {
    // if no UI, then create BoostNotebook directly and return it
    if (!useUINotebook) {
        const boostNb = new boostnb.BoostNotebook();
        boostNb.metadata = {
            defaultDir: BoostConfiguration.defaultDir,
            sourceFile: "./",
        };
        return boostNb;
    }

    // otherwise, create a VSC notebook document and return it
    const notebookData: vscode.NotebookData = {
        metadata: {
            defaultDir: BoostConfiguration.defaultDir,
            sourceFile: "./",
        },
        cells: [],
    };
    const dummmyToken = new vscode.CancellationTokenSource().token;

    const notebookBlob = await new BoostContentSerializer().serializeNotebook(
        notebookData,
        dummmyToken
    );
    fs.writeFileSync(filename.fsPath, notebookBlob);

    const newNotebook = await vscode.workspace.openNotebookDocument(filename);

    return newNotebook;
}

export function sourceFileFromFullPath(fileUri: vscode.Uri): string {
    // we need to write the relativePath to the workspace into the notebook, so the source path isn't local to the system
    // if there is a workspace... otherwise, we just write it as is
    let baseFolder: string;
    let sourceFilePath = fileUri.fsPath;
    if (vscode.workspace.workspaceFolders) {
        const workspaceFolder = vscode.workspace.workspaceFolders[0]; // Get the first workspace folder
        baseFolder = workspaceFolder.uri.fsPath;
        const relativePath = path.relative(baseFolder, sourceFilePath);
        // just use full path if the file is outside our workspace
        if (!relativePath.startsWith("..")) {
            sourceFilePath = "./" + relativePath;
        }
    }
    return sourceFilePath;
}


export function getOrCreateGuideline(
    projectGuidelineFile: vscode.Uri,
    guidelineType: any
): boolean {
    if (fs.existsSync(projectGuidelineFile.fsPath)) {
        return false;
    }
    const sampleGuideline = `# Enter Your ${
        guidelineType ? guidelineType : "Project"
    } Guidelines Here\n\nYou can describe your goals, constraints, or hints for analysis`;

    const sampleGuidelineCell = new boostnb.BoostNotebookCell(
        boostnb.NotebookCellKind.Markup,
        "",
        "markdown"
    );
    const notebookMetadata: any = { id: sampleGuidelineCell.id };
    notebookMetadata["guidelineType"] = guidelineType
        ? guidelineType
        : "Project";
    sampleGuidelineCell.initializeMetadata(notebookMetadata);
    sampleGuidelineCell.value = sampleGuideline;
    const newGuidelineNotebook = new boostnb.BoostNotebook();
    newGuidelineNotebook.addCell(sampleGuidelineCell);

    newGuidelineNotebook.save(projectGuidelineFile.fsPath);

    return true;
}

export async function getOrCreateBlueprintUri(
    context: vscode.ExtensionContext,
    filePath: string
): Promise<vscode.Uri> {
    const workspacePath = vscode.workspace.workspaceFolders
        ? vscode.workspace.workspaceFolders[0].uri.fsPath
        : "";
    const absoluteFilePath = path.resolve(workspacePath, filePath);
    const uri = vscode.Uri.file(absoluteFilePath);
    if (fs.existsSync(absoluteFilePath)) {
        const existingNotebook = new boostnb.BoostNotebook();
        existingNotebook.load(absoluteFilePath);
        // repair the sourceFile metadata if missing
        if (existingNotebook.metadata["sourceFile"] === undefined) {
            existingNotebook.updateMetadata("sourceFile", "./");
            existingNotebook.flushToFS();
        }
        return uri;
    }

    // If the file doesn't exist, create it with data from blueprint_template.md
    const extensionPath = context.extensionPath;
    const templatePath = path.join(
        extensionPath,
        "resources",
        "blueprint_template.md"
    );
    const normalizedTemplatePath = path.normalize(templatePath);
    const data = fs.readFileSync(normalizedTemplatePath, "utf8");

    //filePath might point to a directory that does not exist yet. check for that and create it if necessary
    const folderPath = path.dirname(absoluteFilePath);
    fs.mkdirSync(folderPath, { recursive: true });

    // technically this cached markdown file is not a normal notebook file - and since the
    //  project summary is in a notebook form, we need to convert it into a new notebook with a Blueprint summary cell

    const newBlueprintSummaryNotebook: boostnb.BoostNotebook =
        (await createEmptyNotebook(uri, false)) as boostnb.BoostNotebook;
    newBlueprintSummaryNotebook.updateMetadata("sourceFile", "./");

    const newBlueprintCell = new boostnb.BoostNotebookCell(
        boostnb.NotebookCellKind.Markup,
        "",
        "markdown"
    );
    newBlueprintCell.initializeMetadata({
        id: newBlueprintCell.id,
        outputType: ControllerOutputType.blueprint,
    });
    newBlueprintCell.value = data;
    newBlueprintSummaryNotebook.addCell(newBlueprintCell);
    newBlueprintSummaryNotebook.save(uri.fsPath);

    return uri;
}
