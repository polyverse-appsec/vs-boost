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
        sourceCells: vscode.NotebookCell[] | BoostNotebookCell[],
        notebook: vscode.NotebookDocument | BoostNotebook,
        session : vscode.AuthenticationSession) {

        let successfullyCompleted = true;
        const promises = [];
        const usingBoostNotebook = (notebook instanceof BoostNotebook);

        if (sourceCells.length = 0) {
            boostLogging.warn(`No cells to ${this.command} of Notebook ${usingBoostNotebook?notebook.fsPath:notebook.uri.toString()}`, false);
            return;
        }

        boostLogging.info(`Starting ${this.command} of Notebook ${usingBoostNotebook?notebook.fsPath:notebook.uri.toString()}`, false);

        // are we summarizing a source file or a project?
        let summarizeSourceFile = false;
        if (usingBoostNotebook) {
            summarizeSourceFile = (notebook.metadata['sourceFile'] as string)?.endsWith(NOTEBOOK_SUMMARY_EXTENSION);
        } else {
            summarizeSourceFile = notebook.uri.toString().endsWith(NOTEBOOK_SUMMARY_EXTENSION);
        }

        let inputs : string[] = [];
        for (const cellToSummarize of sourceCells) {
            if (usingBoostNotebook) {
                inputs.push((cellToSummarize as BoostNotebookCell).value);
            } else {
                inputs.push((cellToSummarize as vscode.NotebookCell).document.getText());
            }
		}

        const combinedInput = inputs.join(summaryInputDelimiter);

        let targetNotebookUri : vscode.Uri;
        let targetNotebook : vscode.NotebookDocument | BoostNotebook;
        if (usingBoostNotebook) {
            targetNotebookUri = getBoostNotebookFile(vscode.Uri.parse(notebook.metadata['sourceFile'] as string));
            targetNotebook = new BoostNotebook();
            targetNotebook.load(targetNotebookUri.fsPath);
        } else {
            targetNotebookUri = getBoostNotebookFile(notebook.uri);
            targetNotebook = await vscode.workspace.openNotebookDocument(targetNotebookUri);
        }
        const targetCell = findCellByKernel(targetNotebook, this.command);
        if (!targetCell) {
            boostLogging.error(`Could not find cell for ${this.command} in Notebook: ${targetNotebookUri.toString()}`, !usingBoostNotebook);
            return;
        }

        // summaries are written to the side-by-notebook (e.g. e.g. for foo.py, the boost notebook is foo.py.boost-notebook, and summary is foo.py.summary.boost-notebook)
        // the cell written is ONE cell for the entire source file in the summary file
        // or in the case of a project, each cell contains the summary across all source files
        // if we are summarizing all 
        promises.push(
            this.doExecution(targetNotebook, targetCell, session).then((result) => {
                if (!result) {
                    successfullyCompleted = false;
                }
                if (usingBoostNotebook) {
                    boostLogging.info(`Finished ${this.command} of Notebook ${targetNotebookUri.fsPath} on cell ${(targetCell as BoostNotebookCell).id} at ${new Date().toLocaleTimeString()}`, !usingBoostNotebook);
                }
            }) as Promise<boolean>);
        await Promise.all(promises).then((results) => {
            results.forEach((result) => {
                successfullyCompleted &&= (result ?? true);
            });
            if (!successfullyCompleted) {
                boostLogging.error(`Error ${this.command} of Notebook ${usingBoostNotebook?notebook.fsPath:notebook.uri.toString()}`, !usingBoostNotebook);
            } else {
                boostLogging.info(`Success ${this.command} of Notebook ${usingBoostNotebook?notebook.fsPath:notebook.uri.toString()}`, false);
            }
            return successfullyCompleted;
          }).catch((error) => {
            successfullyCompleted = false;
            boostLogging.error(`Error ${this.command} of Notebook ${usingBoostNotebook?notebook.fsPath:notebook.uri.toString()}: ${error.toString()}}`, !usingBoostNotebook);
        });
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