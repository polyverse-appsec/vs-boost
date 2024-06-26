import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

import * as boostnb from '../data/jupyter_notebook';

import { ControllerOutputType, functionOutputTypeExtension } from '../controllers/controllerOutputTypes';
import { KernelControllerBase, errorMimeType } from '../controllers/base_controller';
import { fullPathFromSourceFile } from '../utilities/files';
import { BoostExtension } from './BoostExtension';
import { BugFunctionKernelControllerBase } from '../controllers/bug_function_base_controller';
import { BoostConfiguration, extensionId } from './boostConfiguration';
import { boostLogging } from '../utilities/boostLogging';
import { errorToString } from '../utilities/error';

export const vscodeFolderName = ".vscode";
export const extensionsJsonFileName = "extensions.json";

export function lineNumberBaseFromCell(cell: vscode.NotebookCell | boostnb.BoostNotebookCell): number {
    let lineNumberBase: any;

    if (cell instanceof boostnb.BoostNotebookCell) {
        lineNumberBase = cell.metadata ? cell.metadata.lineNumberBase : undefined;
    } else {
        lineNumberBase = cell.metadata ? cell.metadata.lineNumberBase : undefined;
    }

    // Check if lineNumberBase is a number, if not, return 0
    return typeof lineNumberBase === 'number' ? lineNumberBase : 0;
}

export function getAnalysisForSourceTarget(
    analysisNotebook : boostnb.BoostNotebook,
    outputType?: ControllerOutputType,
    selection? : vscode.Selection,
    excludedOutputTypes? : ControllerOutputType[]) : string[] {

    const analysisLines : string[] = [];

    const targetStartLine : number = selection ? selection.start.line : 0;
    const targetEndLine : number = selection ? selection.end.line : Number.MAX_SAFE_INTEGER;

    let done = false;
    analysisNotebook.cells.forEach((cell : boostnb.BoostNotebookCell) => {
        // break early if done
        if (done) {
            return;
        }

        const cellReportedStartLine : number = lineNumberBaseFromCell(cell);
        const adjustedCellStartLine : number = cellReportedStartLine > 0 ? cellReportedStartLine: 1;

        // we only use source lines to determine which cells to capture
        const cellSourceLines = cell.value? cell.value.split("\n").length : 0;
        const cellSpanEnd = cellSourceLines + adjustedCellStartLine - 1;

        // if the cell is before the start line, skip it
        if (cellSpanEnd < targetStartLine) {
            return;
        // if the cell is after the end line, we're done
        } else if (adjustedCellStartLine > targetEndLine) {
            done = true;
            return;
        }

        // grab all the analysis
        cell.outputs.forEach((output : boostnb.SerializedNotebookCellOutput) => {
            // ignore outputs that aren't our output type
            // an undefined outputType (e.g. all types) will always be included 
            if (outputType && output.metadata?.outputType !== outputType) {
                return;
            }

            // skip excluded types
            if (excludedOutputTypes && excludedOutputTypes.includes(output.metadata?.outputType as ControllerOutputType)) {
                return;
            }

            // if we are looking at a function output, and there is no details (e.g. no diagnostic issues), skip it
            if (output.metadata?.outputType?.endsWith(functionOutputTypeExtension)) {
                if (!output.metadata?.details?.length) {
                    return;
                }
            }
            for (const item of output.items) {
                if (item.mime === errorMimeType) {
                    return;
                }

                analysisLines.push(item.data);
            }
        });
    });
    return analysisLines;
}

// retrieves a list of all output types that have analysis data in a notebook
export function getAnalysisMetaDataForSourceTarget(
    analysisNotebook : boostnb.BoostNotebook,
    selection? : vscode.Selection) : ControllerOutputType[] {

    const analysisMetaDataFound : any = {};

    const targetStartLine : number = selection ? selection.start.line : 0;
    const targetEndLine : number = selection ? selection.end.line : Number.MAX_SAFE_INTEGER;

    let done = false;
    analysisNotebook.cells.forEach((cell : boostnb.BoostNotebookCell) => {
        // break early if done
        if (done) {
            return;
        }

        const cellReportedStartLine : number = lineNumberBaseFromCell(cell);
        const adjustedCellStartLine : number = cellReportedStartLine > 0 ? cellReportedStartLine: 1;

        // we only use source lines to determine which cells to capture
        const cellSourceLines = cell.value? cell.value.split("\n").length : 0;
        const cellSpanEnd = cellSourceLines + adjustedCellStartLine - 1;

        // if the cell is before the start line, skip it
        if (cellSpanEnd < targetStartLine) {
            return;
        // if the cell is after the end line, we're done
        } else if (adjustedCellStartLine > targetEndLine) {
            done = true;
            return;
        }

        // grab all the analysis
        cell.outputs.forEach((output : boostnb.SerializedNotebookCellOutput) => {
            if (output.items.some((item : any) => {
                if (item.mime === errorMimeType) {
                    return false;
                }

                if (item.data.length === 0) {
                    return false;
                }

                return true;
            })) {
                analysisMetaDataFound[output.metadata?.outputType] = true;
            }
        });
    });
    return Object.keys(analysisMetaDataFound) as ControllerOutputType[];
}

// retrieves a list of all output types that have analysis data in a notebook
export function getAnalysisProblemMetaDataForSourceTarget(
    problemCollection : vscode.DiagnosticCollection,
    filenameTarget : string,
    selection? : vscode.Selection) : vscode.Diagnostic[] {

    const analysisMetaDataFound : any = {};

    let targetStartLine : number = selection ? selection.start.line : 0;
    let targetEndLine : number = selection ? selection.end.line : Number.MAX_SAFE_INTEGER;

    //expand the startline and endline to three before and three after
    targetStartLine = targetStartLine > 3 ? targetStartLine - 3 : 0;
    targetEndLine= targetEndLine < Number.MAX_SAFE_INTEGER -3 ? targetEndLine + 3: Number.MAX_SAFE_INTEGER;

    const sourceUri = fullPathFromSourceFile(filenameTarget);

    const existingDiagnostics = problemCollection.get(sourceUri);
    if (!existingDiagnostics || existingDiagnostics.length === 0) {
        return [];
    }

    const scopedDiagnostics = existingDiagnostics.filter((diagnostic : vscode.Diagnostic) => {
        return diagnostic.range.start.line >= targetStartLine && diagnostic.range.end.line <= targetEndLine;
    });
    return scopedDiagnostics;
}

interface AnalysisInfo {
    count: number;
    displayName: string;
}

export function generateSingleLineSummaryForAnalysisData(
    extension : BoostExtension,
    analysisNotebook : boostnb.BoostNotebook,
    selection? : vscode.Selection) : string {
    
    const analysisTypes = getAnalysisMetaDataForSourceTarget(analysisNotebook, selection);
    const analysisFound: Record<string, AnalysisInfo> = {};
    analysisTypes.forEach((outputType : ControllerOutputType) => {
        analysisFound[outputType] = { 
            count: 0,
            displayName: ""
        };
    });

    extension.kernels.forEach((kernel : KernelControllerBase) => {
        if( analysisFound[kernel.outputType] !== undefined ) {
            //if we have one of these in our output, set the display name.
            analysisFound[kernel.outputType].displayName = kernel.displayCategory;
        } 
        if (!(kernel instanceof BugFunctionKernelControllerBase)) {
            return;
        }

        const functionController = kernel as BugFunctionKernelControllerBase;

        const problemsIdentified = getAnalysisProblemMetaDataForSourceTarget(
            functionController.sourceLevelIssueCollection, analysisNotebook.metadata.sourceFile as string, selection);

        if (problemsIdentified.length === 0) {
            delete analysisFound[functionController.outputType];
        } else if (analysisFound[functionController.outputType] !== undefined) {
            analysisFound[functionController.outputType].count += problemsIdentified.length;
            analysisFound[functionController.outputType].displayName = functionController.displayCategory;
        }
    });

    const displayNameMap: Map<string, number> = new Map();

    // Create a map with unique displayNames and their counts
    for (const [type, info] of Object.entries(analysisFound) as [string, AnalysisInfo][]) {
        if (displayNameMap.has(info.displayName)) {
            if (info.count > 0) {
                const existingCount = displayNameMap.get(info.displayName) || 0;
                displayNameMap.set(info.displayName, existingCount + info.count);
            }
        } else {
            displayNameMap.set(info.displayName, info.count);
        }
    }
    
    // Create the analysisItems based on the unique displayNames and their counts
    const analysisItems: string[] = [];
    
    for (const [displayName, count] of displayNameMap.entries()) {
        if (count > 0) {
            analysisItems.push(`${displayName}(${count})`);
        } else {
            analysisItems.push(displayName);
        }
    }
    
    const analysisReport = analysisItems.join(", ");

    return `${analysisReport}`;
}

export const defaultBoostRecommendationExtensionJsonFile : string =
`{
    "recommendations": [
        "polyversecorporation.polyverse-boost-notebook"
    ]
}`;

export function addBoostToProjectExtensions(): boolean {
    const projectPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!projectPath) {
        return false;
    }
    const baseProjectFolder = path.basename(projectPath);

    if (!BoostConfiguration.addBoostToAnalyzedProjects) {
        boostLogging.debug(`Skipping adding Boost to ${baseProjectFolder} Project Extensions per global configuration`);
        return false;
    }

    const extensionsJsonFullPath = path.normalize(path.join(projectPath, vscodeFolderName, extensionsJsonFileName));

    // if the extension file doesn't exist, create it (and folder if necessary)
    if (!fs.existsSync(extensionsJsonFullPath)) {
        const extensionsJsonFolder = path.dirname(extensionsJsonFullPath);
        if (!fs.existsSync(extensionsJsonFolder)) {
            fs.mkdirSync(extensionsJsonFolder, { recursive: true });
            boostLogging.info(`Created ${extensionsJsonFolder} folder for Boost Extension recommendation`, false);
        }

        fs.writeFileSync(extensionsJsonFullPath, defaultBoostRecommendationExtensionJsonFile, { encoding: "utf8" });
        boostLogging.info(`Created ${extensionsJsonFullPath} file for Boost Extension recommendation`, false);
        return true;
    }

    return updateExtensionRecommendations(extensionsJsonFullPath);
}

/**
 * Add or verify an extension recommendation in a `.vscode/extensions.json` file.
 * @param filePath Path to the `.vscode/extensions.json` file.
 */
function updateExtensionRecommendations(filePath: string): boolean {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    let jsonContent;

    try {
        jsonContent = JSON.parse(fileContent);
    } catch (error) {
        boostLogging.error(`Skipping Boost Extension Recommendation addition - due to JSON parsing failure in ${filePath}: ${errorToString(error)}`, false);
        return false;
    }

    if (!jsonContent.recommendations) {
        jsonContent.recommendations = [extensionId];
        boostLogging.info(`Added Boost Extension Recommendation for Project file: ${filePath}.`);
    } else if (!jsonContent.recommendations.includes(extensionId)) {
        jsonContent.recommendations.push(extensionId);
        boostLogging.info(`Updated Existing Project Extension Recommendations with Boost in Project file: ${filePath}.`);
    } else {
        boostLogging.debug(`Boost Extension recommendation already found in Project file: ${filePath}.`);
        return false; // Return early as no update is required.
    }

    // Write the updated JSON back to the file.
    try {
        fs.writeFileSync(filePath, JSON.stringify(jsonContent, null, 4));
    } catch (error) {
        boostLogging.error(`Failed to add Boost Extension Recommendation to ${filePath} due to error: ${errorToString(error)}`, false);
        return false;
    }
    return true;
}

export function setGlobalContextData(key: string, data: any) {
    // we prepend boost to the key just to avoid conflicts with other extensions
    vscode.commands.executeCommand('setContext', `boost:${key}`, data);
}