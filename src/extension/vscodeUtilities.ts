import * as vscode from 'vscode';
import * as boostnb from '../data/jupyter_notebook';

import { ControllerOutputType } from '../controllers/controllerOutputTypes';
import { errorMimeType } from '../controllers/base_controller';

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
    outputType: ControllerOutputType,
    analysisNotebook : boostnb.BoostNotebook,
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
            if (output.metadata?.outputType !== outputType) {
                return;
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