import * as vscode from 'vscode';
import * as boostnb from '../data/jupyter_notebook';

import { ControllerOutputType, functionOutputTypeExtension } from '../controllers/controllerOutputTypes';
import { KernelControllerBase, errorMimeType } from '../controllers/base_controller';
import { fullPathFromSourceFile } from '../utilities/files';
import { BoostExtension } from './BoostExtension';
import { FunctionKernelControllerBase } from '../controllers/function_base_controller';
import { stringify } from 'querystring';
import { any } from 'micromatch';

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
    selection? : vscode.Selection) : string[] {

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

            // if we are looking at a function output, and there is no details (e.g. no diagnostic issues), skip it
            if (outputType!.endsWith(functionOutputTypeExtension)) {
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
    outputHeader: string;
}

export function generateSingleLineSummaryForAnalysisData(
    extension : BoostExtension,
    analysisNotebook : boostnb.BoostNotebook,
    selection? : vscode.Selection) : string {
    
    const analysisTypes = getAnalysisMetaDataForSourceTarget(analysisNotebook, selection);
    const analysisFound: Record<string, AnalysisInfo> = {};
    analysisTypes.forEach((analysisType : ControllerOutputType) => {
        analysisFound[analysisType] = { 
            count: 0,
            outputHeader: ""
        }; 
    });

    extension.kernels.forEach((kernel : KernelControllerBase) => {
        if( analysisFound[kernel.outputType] !== undefined ) {
            //if we have one of these in our output, set the display name.
            analysisFound[kernel.outputType].outputHeader = kernel.outputHeader;
        } 
        if (!(kernel instanceof FunctionKernelControllerBase)) {
            return;
        }

        const functionController = kernel as FunctionKernelControllerBase;

        const problemsIdentified = getAnalysisProblemMetaDataForSourceTarget(
            functionController.sourceLevelIssueCollection, analysisNotebook.metadata.sourceFile as string, selection);

        if (problemsIdentified.length === 0) {
            delete analysisFound[functionController.outputType];
        } else if (analysisFound[functionController.outputType] !== undefined) {
            analysisFound[functionController.outputType].count = problemsIdentified.length;
            analysisFound[functionController.outputType].outputHeader = functionController.outputHeader;
        }
    });

    const analysisItems = [];
    for (const [type, info ] of Object.entries(analysisFound) as [string, AnalysisInfo][]) {
        if (info.count === 0) {
            analysisItems.push(info.outputHeader);
        } else {
            analysisItems.push(`${info.outputHeader}(${info.count})`);
        }
    }

    const analysisReport = analysisItems.join(", ");

    return `Boost Analysis: ${analysisReport}`;
}