import {
    KernelControllerBase, onServiceErrorHandler
 } from './base_controller';
import { DiagnosticCollection, ExtensionContext } from 'vscode';
import { BoostConfiguration } from './boostConfiguration';
import * as vscode from 'vscode';
import { BoostNotebook, BoostNotebookCell } from './jupyter_notebook';
import { boostLogging } from './boostLogging';
import { NOTEBOOK_SUMMARY_EXTENSION } from './jupyter_notebook';
import { getBoostNotebookFile, findCellByKernel } from './extension';
import { NotebookCellKind } from './jupyter_notebook';

export const summaryCellMarker = 'summary';

const summaryInputDelimiter = '# New Input Follows';

export class SummarizeKernel extends KernelControllerBase {
	constructor(context: ExtensionContext, onServiceErrorHandler: onServiceErrorHandler, otherThis : any, collection: DiagnosticCollection) {
        super(
            collection,
            'summarize',
            'Summarize Analysis',
            'Summarizes the analysis across cells',
            summaryCellMarker,
            false,
            false,
            context,
            otherThis,
            onServiceErrorHandler);
	}

	dispose(): void {
		super.dispose();
	}

    public get serviceEndpoint(): string {
        switch (BoostConfiguration.cloudServiceStage)
        {
            case "local":
                return 'http://127.0.0.1:8000/summarize';
            case 'dev':
                return '';
            case "test":
                return '';
            case 'staging':
            case 'prod':
            default:
                return '';
        }   
    }

    async executeAll(
        sourceCells: (vscode.NotebookCell | BoostNotebookCell)[],
        notebook: vscode.NotebookDocument | BoostNotebook,
        session: vscode.AuthenticationSession
    ) {
        let successfullyCompleted = true;
        const promises: Promise<boolean>[] = [];
        const usingBoostNotebook = notebook instanceof BoostNotebook;
    
        if (sourceCells.length === 0) {
            boostLogging.warn(`No cells to ${this.command} of Notebook ${usingBoostNotebook ? notebook.fsPath : notebook.uri.toString()}`, false);
            return;
        }
    
        boostLogging.info(`Starting ${this.command} of Notebook ${usingBoostNotebook ? notebook.fsPath : notebook.uri.toString()}`, false);
    
        // are we summarizing a source file or a project?
        let summarizeSourceFile = false;
        if (usingBoostNotebook) {
            summarizeSourceFile = (notebook.metadata['sourceFile'] as string)?.endsWith(NOTEBOOK_SUMMARY_EXTENSION);
        } else {
            summarizeSourceFile = notebook.uri.toString().endsWith(NOTEBOOK_SUMMARY_EXTENSION);
        }
    
        // grab all the cell contents by type/command/kernel for submission
        const inputs: string[] = [];
        for (const cellToSummarize of sourceCells) {
            if (usingBoostNotebook) {
                const cell = cellToSummarize as BoostNotebookCell;
                cell.outputs.filter((output) => output.metadata?.output_type === this.command).forEach((output) => {
                    output.items.forEach((item) => {
                        inputs.push(item.data);
                    });
                });
            } else {
                const cell = cellToSummarize as vscode.NotebookCell;
                cell.outputs.filter((output) => output.metadata?.output_type === this.command).forEach((output) => {
                    output.items.forEach((item) => {
                        const decodedText = new TextDecoder().decode(item.data);

                        inputs.push(decodedText);
                    });
                });
            }
        }
    
        // combine all the input into a single long string with input delimiters
        const combinedInput = inputs.join(summaryInputDelimiter);
    
        let targetNotebookUri: vscode.Uri = getBoostNotebookFile(vscode.Uri.parse(notebook.metadata['sourceFile'] as string));
        let targetNotebook: BoostNotebook = new BoostNotebook();
        targetNotebook.load(targetNotebookUri.fsPath);

        // we create a placeholder cell for the input, so we can do processing on the input
        // then we'll take the resulting data and put into the cell itself
        const tempProcessingCell = new BoostNotebookCell(NotebookCellKind.Markup, combinedInput, "markdown");
    
        // summaries are written to the side-by-notebook (e.g. e.g. for foo.py, the boost notebook is foo.py.boost-notebook, and summary is foo.py.summary.boost-notebook)
        // the cell written is ONE cell for the entire source file in the summary file
        // or in the case of a project, each cell contains the summary across all source files
        // if we are summarizing all
        const result = await this.doExecution(targetNotebook, tempProcessingCell, session);
        if (!result) {
            boostLogging.error(`Error ${this.command} of Notebook ${usingBoostNotebook?
                notebook.fsPath : notebook.uri.toString()}`, !usingBoostNotebook);
        } else {
            boostLogging.info(`Success ${this.command} of Notebook ${usingBoostNotebook ? notebook.fsPath : notebook.uri.toString()}`, false);
        }

        let targetCell = findCellByKernel(targetNotebook, this.command) as BoostNotebookCell;
        if (!targetCell) {
            targetCell = new BoostNotebookCell(NotebookCellKind.Markup, "", "markdown");
            targetNotebook.addCell(targetCell);
        }
        // snap the processed analysis summary from the temp cell and store it as the new summary cell in the summary notebook
        targetCell.value = tempProcessingCell.outputs[0].items[0].data;

        if (usingBoostNotebook) {
            boostLogging.info(`Finished ${this.command} of Notebook ${targetNotebookUri.fsPath} on cell ${(tempProcessingCell as BoostNotebookCell).id} at ${new Date().toLocaleTimeString()}`, !usingBoostNotebook);
        }
    }

    async onBoostServiceRequest(
        cell : vscode.NotebookCell | BoostNotebookCell,
        serviceEndpoint : string,
        payload : any) : Promise<string>
    {
        const usingBoostNotebook = "value" in cell; // if the cell has a value property, then it's a BoostNotebookCell

        //  dynamically add payload properties to send to Boost service
        payload.analysis_type = this.command;

        return super.onBoostServiceRequest(cell, serviceEndpoint, payload);
    }

    onKernelOutputItem(response: any, mimetype : any): string {
        if (response.analysis === undefined) {
            throw new Error("Unexpected missing data from Boost Service");
        }
        return `\n\n---\n\n### Boost Summary\n\nLast Updated: ${this.currentDateTime}\n\n${response.analysis}`;
    }

    localizeError(error: Error): Error {
        error.message = "Boost Summary failed: " + error.message;
        return error;
    }
}