import {
    KernelControllerBase, onServiceErrorHandler
 } from './base_controller';
import { DiagnosticCollection, ExtensionContext } from 'vscode';
import { BoostConfiguration } from './boostConfiguration';
import * as vscode from 'vscode';
import { BoostNotebook, BoostNotebookCell, NOTEBOOK_EXTENSION } from './jupyter_notebook';
import { boostLogging } from './boostLogging';
import { NOTEBOOK_SUMMARY_EXTENSION } from './jupyter_notebook';
import { getBoostFile, findCellByKernel, BoostFileType, fullPathFromSourceFile } from './extension';
import { NotebookCellKind } from './jupyter_notebook';
import * as fs from 'fs';
import * as path from 'path';

export const summaryCellMarker = 'summary';
export const summarizeKernelName = 'summarize';

const summaryInputDelimiter = '# New Input Follows';

export class SummarizeKernel extends KernelControllerBase {
    _kernels : Map<string, KernelControllerBase>;
	constructor(
        context: ExtensionContext,
        onServiceErrorHandler: onServiceErrorHandler,
        otherThis : any,
        collection: DiagnosticCollection,
        kernels : Map<string, KernelControllerBase>) {

        super(
            collection,
            summarizeKernelName,
            'Summarize Analysis',
            'Summarizes the analysis across cells',
            summaryCellMarker,
            false,
            false,
            context,
            otherThis,
            onServiceErrorHandler,
            "inputs");

        this._kernels = kernels;
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
                return 'https://sh6w6cyjee6wmtmlqutbxy6d2y0vaaas.lambda-url.us-west-2.on.aws/';
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
        session: vscode.AuthenticationSession,
        forceAnalysisRefresh: boolean = false
    ) {
        const usingBoostNotebook = notebook instanceof BoostNotebook;

        // for now, we ignore forceAnalysisRefresh - and always re-analyze
        forceAnalysisRefresh = true;
            
        // are we summarizing a source file or a project?
        let summarizeProject = (notebook.metadata['sourceFile'] as string) === './';

        // input data is not held cells - its held in satellite notebook files
        if (sourceCells.length === 0 && !summarizeProject) {
            boostLogging.warn(`No cells to ${this.command} of Notebook ${usingBoostNotebook ? notebook.fsPath : notebook.uri.toString()}`, false);
            return;
        }
    
        boostLogging.info(`Starting ${this.command} of Notebook ${usingBoostNotebook ? notebook.fsPath : notebook.uri.toString()}`, false);

        // summary is designed to review an entire file - since it will replace the file-level summary each time
        // warn user - but still do it
        if (sourceCells.length < notebook.cellCount) {
            boostLogging.warn(`Not all cells (${sourceCells.length}/${notebook.cellCount}) are analyzed for ${this.command} of Notebook ${notebook.uri.toString()}`, !usingBoostNotebook);
        }

        let targetNotebookUri: vscode.Uri;
        let targetNotebook: BoostNotebook = new BoostNotebook();

        // if we're summarizing a source file, we need to summarize all the cells in the source
        if (!summarizeProject) {
            targetNotebookUri = getBoostFile(fullPathFromSourceFile(notebook.metadata['sourceFile'] as string), BoostFileType.summary);

            if (fs.existsSync(targetNotebookUri.fsPath)) {
                targetNotebook.load(targetNotebookUri.fsPath);
            } else {
                targetNotebook.save(targetNotebookUri.fsPath);
            }
        } else {
            targetNotebook = notebook as BoostNotebook;
            targetNotebookUri = vscode.Uri.parse(targetNotebook.fsPath);
        }

        let successfullyCompleted = true;
        const executionContexts : any[] = [];
        if (!summarizeProject) {
            sourceCells.forEach(cell => {
                executionContexts.push(super.openExecutionContext(usingBoostNotebook, cell));
            });
        }

        try
        {
            for (const controller of this._kernels) {
                await this._summarizeCellsForKernel(controller[1].outputType, summarizeProject,
                    sourceCells, targetNotebook, notebook, session, usingBoostNotebook);
            }
        } catch (rethrow) {
            successfullyCompleted = false;
            boostLogging.error(`Error during ${this.command} of Notebook ${targetNotebookUri.fsPath} at ${new Date().toLocaleTimeString()}`, false);
            throw rethrow;
        }
        finally {
            if (!summarizeProject) {
                executionContexts.forEach(executionContext => {
                    super.closeExecutionContext(executionContext, successfullyCompleted);
                });
            }
        }
    
        if (usingBoostNotebook) {
            boostLogging.info(`Finished ${this.command} of Notebook ${targetNotebookUri.fsPath} at ${new Date().toLocaleTimeString()}`, !usingBoostNotebook);
        }
    }

    async _summarizeCellsForKernel(
        outputType : string,
        summarizeProject : boolean,
        sourceCells : (vscode.NotebookCell | BoostNotebookCell)[],
        targetNotebook: BoostNotebook,
        notebook: vscode.NotebookDocument | BoostNotebook,
        session: vscode.AuthenticationSession,
        usingBoostNotebook : boolean) {

        let combinedInput : string = "";
        if (!summarizeProject) {
            // if we are summarizing a source file, we need to summarize all the cells
            combinedInput = this._summarizeCellsAsSingleInput(sourceCells, usingBoostNotebook, outputType);
        } else {
            // if we are summarizing a project or folder, we need to summarize all the files in it
            combinedInput = this._summarizeSourceFilesAsSingleInput(targetNotebook.metadata['sourceFile'] as string, outputType);
        }
        // if we got no input, then skip deep processing
        if (!combinedInput) {
            return;
        }
    
        // we create a placeholder cell for the input, so we can do processing on the input
        // then we'll take the resulting data and put into the cell itself
        const tempProcessingCell = new BoostNotebookCell(NotebookCellKind.Markup, combinedInput, "markdown");
        tempProcessingCell.initializeMetadata({"id": tempProcessingCell.id, "type": "originalCode"});
    
        // summaries are written to the side-by-notebook (e.g. e.g. for foo.py, the boost notebook is foo.py.boost-notebook, and summary is foo.py.summary.boost-notebook)
        // the cell written is ONE cell for the entire source file in the summary file
        // or in the case of a project, each cell contains the summary across all source files
        // if we are summarizing all
        const result = await this.doExecution(targetNotebook, tempProcessingCell, session);
        if (!result) {
            boostLogging.error(`Error ${this.command} of Notebook ${usingBoostNotebook?
                (notebook as BoostNotebook).fsPath : notebook.uri.toString()}`, !usingBoostNotebook);
        } else {
            boostLogging.info(`Success ${this.command} of Notebook ${usingBoostNotebook ? (notebook as BoostNotebook).fsPath : notebook.uri.toString()}`, false);
        }

        let targetCell = findCellByKernel(targetNotebook, outputType) as BoostNotebookCell;
        if (!targetCell) {
            targetCell = new BoostNotebookCell(NotebookCellKind.Markup, "", "markdown");
            targetCell.initializeMetadata({"id": targetCell.id, "outputType": outputType});
            targetNotebook.addCell(targetCell);
        }
        // snap the processed analysis summary from the temp cell and store it as the new summary cell in the summary notebook
        targetCell.value = tempProcessingCell.outputs[0].items[0].data;

        targetNotebook.flushToFS();
    }

    async _summarizeSourceFilesAsSingleInput(sourceFolder: string, outputType: string): string {
        if (!vscode.workspace.workspaceFolders) {
            boostLogging.error("No workspace folder found for summarizing source files", false);
            return '';
        }

        // if we don't have a workspace folder, just place the Boost file in a new Boostdir - next to the source file
        const workspaceFolder = vscode.workspace.workspaceFolders[0]; // Get the first workspace folder

        // create the .boost folder if we need to - this is statically located in the workspace folder no matter which child folder is processed
        const boostFolder = path.join(workspaceFolder.uri.fsPath, BoostConfiguration.defaultDir);
        const searchFolder = path.join(boostFolder, sourceFolder);
        
        // we're going to search for every boost summary notebook under our target folder (which is under Boost folder)
        let searchPattern = new vscode.RelativePattern(searchFolder, '**/*' + NOTEBOOK_SUMMARY_EXTENSION);
        let files = await vscode.workspace.findFiles(searchPattern);

        // grab all the cell contents by type/command/kernel for submission
        const inputs: string[] = [];
        await Promise.all(files.map(async (file) => {
            // Perform async operation for each file
            inputs.push(await this.getAnalysisFromNotebook(file, outputType));
            }));
    
        // combine all the input into a single long string with input delimiters
        const combinedInput = inputs.join(summaryInputDelimiter);
        return combinedInput;
    }

    async getAnalysisFromNotebook(notebookUri: vscode.Uri, outputType: string) : Promise<string> {
        return new Promise(async (resolve, reject) => {
            try {
                const notebook = new BoostNotebook();
                notebook.load(notebookUri.fsPath);
                const cell = findCellByKernel(notebook, outputType) as BoostNotebookCell;
                cell.outputs.filter((output) => output.metadata?.outputType === outputType).forEach((output) => {
                    output.items.forEach((item) => {
                        resolve(item.data);
                    });
                });

            } catch (error) {
                reject(error);
            }
        });
    }

    _summarizeCellsAsSingleInput(
        sourceCells : (vscode.NotebookCell | BoostNotebookCell)[],
        usingBoostNotebook : boolean,
        outputType : string) : string {

        // grab all the cell contents by type/command/kernel for submission
        const inputs: string[] = [];
        for (const cellToSummarize of sourceCells) {
            if (usingBoostNotebook) {
                const cell = cellToSummarize as BoostNotebookCell;
                cell.outputs.filter((output) => output.metadata?.outputType === outputType).forEach((output) => {
                    output.items.forEach((item) => {
                        inputs.push(item.data);
                    });
                });
            } else {
                const cell = cellToSummarize as vscode.NotebookCell;
                cell.outputs.filter((output) => output.metadata?.outputType === outputType).forEach((output) => {
                    output.items.forEach((item) => {
                        const decodedText = new TextDecoder().decode(item.data);

                        inputs.push(decodedText);
                    });
                });
            }
        }
    
        // combine all the input into a single long string with input delimiters
        const combinedInput = inputs.join(summaryInputDelimiter);
        return combinedInput;
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