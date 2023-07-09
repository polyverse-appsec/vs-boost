import {
    KernelControllerBase
 } from './base_controller';
import { DiagnosticCollection, ExtensionContext } from 'vscode';
import { BoostConfiguration } from './boostConfiguration';
import * as vscode from 'vscode';
import { BoostNotebook, BoostNotebookCell,
        NotebookCellKind, NOTEBOOK_SUMMARY_EXTENSION } from './jupyter_notebook';
import { boostLogging } from './boostLogging';
import { getBoostFile, findCellByKernel, BoostFileType, fullPathFromSourceFile, cleanCellOutput } from './extension';
import * as fs from 'fs';
import * as path from 'path';
import { blueprintOutputType } from './blueprint_controller';

export const summaryOutputType = 'summary';
export const summarizeKernelName = 'summarize';

export const summaryFailedPrefix = "Error: Boost Summary failed: ";

const summaryInputDelimiter = '# New Input Follows';

export class SummarizeKernel extends KernelControllerBase {
    _kernels : Map<string, KernelControllerBase>;
	constructor(
        context: ExtensionContext,
        onServiceErrorHandler: any,
        otherThis : any,
        collection: DiagnosticCollection,
        kernels : Map<string, KernelControllerBase>) {

        super(
            collection,
            summarizeKernelName,
            'Summarize Analysis',
            'Summarizes the analysis across cells',
            summaryOutputType,
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
                return 'https://6jmbzmndoptau3zsfkf45fpbm40vnsxq.lambda-url.us-west-2.on.aws/';
            case 'staging':
            case 'prod':
            default:
                return 'https://tu5zdmjxvvzbzih6yytjtbm6fa0uvjba.lambda-url.us-west-2.on.aws/';
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
        if (sourceCells.length < notebook.cellCount && !summarizeProject) {
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
                if (controller[1].command === summarizeKernelName) {
                    continue;
                }
                await this._summarizeCellsForKernel(controller[1].outputType, controller[1].kernelLabel, summarizeProject,
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

    noDataToSummarizeMessage = "No Data to Summarize";
    chunkedInputPrefix = 'input_';

    async _summarizeCellsForKernel(
        outputType : string,
        kernelLabel : string,
        summarizeProject : boolean,
        sourceCells : (vscode.NotebookCell | BoostNotebookCell)[],
        targetNotebook: BoostNotebook,
        notebook: vscode.NotebookDocument | BoostNotebook,
        session: vscode.AuthenticationSession,
        usingBoostNotebook : boolean) {

        let combinedInputs : string[];
        if (!summarizeProject) {
            // if we are summarizing a source file, we need to summarize all the cells
            combinedInputs = this._summarizeCellsAsSingleInput(sourceCells, usingBoostNotebook, outputType);
        } else {
            // if we are summarizing a project or folder, we need to summarize all the files in it
            combinedInputs = await this._summarizeSourceFilesAsSingleInput(targetNotebook.metadata['sourceFile'] as string, outputType);
        }
        // if we got no input, then skip deep processing
        let tempProcessingCell = undefined;
        if (combinedInputs && combinedInputs.length > 0) {
            // we create a placeholder cell for the input, so we can do processing on the input
            // then we'll take the resulting data and put it into the metadata (as multiple separate fields)
            // the value will be empty since we don't want to combine it as one large string (yet)
            tempProcessingCell = new BoostNotebookCell(NotebookCellKind.Markup, "***placeholder text - real input is in metadata***", "markdown");
            tempProcessingCell.initializeMetadata(
                {"id": tempProcessingCell.id,
                "type": "originalCode",
                // eslint-disable-next-line @typescript-eslint/naming-convention
                "analysis_type": outputType,
                // eslint-disable-next-line @typescript-eslint/naming-convention
                "analysis_label": kernelLabel});
            if (tempProcessingCell.metadata) {
                for (let i = 0; i < combinedInputs.length; i++) {
                    tempProcessingCell.metadata[this.chunkedInputPrefix + i.toString()] = combinedInputs[i];
                }
            }
        
            // summaries are written to the side-by-notebook (e.g. e.g. for foo.py, the boost notebook is foo.py.boost-notebook, and summary is foo.py.summary.boost-notebook)
            // the cell written is ONE cell for the entire source file in the summary file
            // or in the case of a project, each cell contains the summary across all source files
            // if we are summarizing all
            const result = await this.doExecution(targetNotebook, tempProcessingCell, session);
            if (!result) {
                boostLogging.error(`Error Summarizing ${outputType} of Notebook ${usingBoostNotebook?
                    (notebook as BoostNotebook).fsPath : notebook.uri.toString()}`, !usingBoostNotebook);
            } else {
                boostLogging.info(`Success Summarizing ${outputType} of Notebook ${usingBoostNotebook ? (notebook as BoostNotebook).fsPath : notebook.uri.toString()}`, false);
            }
        } else {
            boostLogging.warn(`Unable to Summarize ${outputType} of Notebook ${usingBoostNotebook ? (notebook as BoostNotebook).fsPath : notebook.uri.toString()}: no source data found`, false);
        }

        let targetCell = findCellByKernel(targetNotebook, outputType) as BoostNotebookCell;
        if (!targetCell) {
            targetCell = new BoostNotebookCell(NotebookCellKind.Markup, "", "markdown");
            targetCell.initializeMetadata({"id": targetCell.id, "outputType": outputType});
            targetNotebook.addCell(targetCell);
        }
        // snap the processed analysis summary from the temp cell and store it as the new summary cell in the summary notebook
        if (tempProcessingCell) {
            targetCell.value = tempProcessingCell.outputs[0].items[0].data;
            if (outputType === blueprintOutputType) {
                // store summary as the blueprint type - so quick blueprint doesn't overwrite it
                targetCell.initializeMetadata({
                    ...targetCell.metadata,
                    "blueprintType": "summary"
                });
            }
        } else {
            // generate synthetic no data output cell
            targetCell.value = this.onKernelOutputItem(
                    {"analysis": this.noDataToSummarizeMessage,
                     // eslint-disable-next-line @typescript-eslint/naming-convention
                     "analysis_type": outputType,
                     // eslint-disable-next-line @typescript-eslint/naming-convention
                     "analysis_label": kernelLabel},
                     targetCell,
                    outputType);
        }

        targetNotebook.flushToFS();
    }

    async _summarizeSourceFilesAsSingleInput(sourceFolder: string, outputType: string): Promise<string[]> {
        if (!vscode.workspace.workspaceFolders) {
            boostLogging.error("No workspace folder found for summarizing source files", false);
            return [];
        }

        // if we don't have a workspace folder, just place the Boost file in a new Boostdir - next to the source file
        const workspaceFolder = vscode.workspace.workspaceFolders[0]; // Get the first workspace folder

        // create the .boost folder if we need to - this is statically located in the workspace folder no matter which child folder is processed
        const boostFolder = path.join(workspaceFolder.uri.fsPath, BoostConfiguration.defaultDir);
        const searchFolder = path.join(boostFolder, sourceFolder);
        const summaryNotebookFileUri = getBoostFile(workspaceFolder.uri, BoostFileType.summary);
        
        // we're going to search for every boost summary notebook under our target folder (which is under Boost folder)
        const searchPattern = new vscode.RelativePattern(searchFolder, '**/*' + NOTEBOOK_SUMMARY_EXTENSION);
        const files = await vscode.workspace.findFiles(searchPattern);

        // grab all the cell contents by type/command/kernel for submission
        const inputs: string[] = [];
        await Promise.all(files.map(async (file) => {
                // ignore the summary rollup file itself
                if (summaryNotebookFileUri.fsPath === file.fsPath) {
                    return;
                }

                // Perform async operation for each file
                const inputFromNotebook = await this.getAnalysisFromNotebook(file, outputType);
                if (inputFromNotebook && !inputFromNotebook.includes(this.noDataToSummarizeMessage)) {
                    if (!this._isEmptySummary(inputFromNotebook)) {
                        inputs.push(cleanCellOutput(inputFromNotebook));
                    }
                }
            }));
    
        return inputs;
    }

    _isEmptySummary(input: string): boolean {
        return input.startsWith(summaryFailedPrefix);
    }

    async getAnalysisFromNotebook(notebookUri: vscode.Uri, outputType: string): Promise<string> {
        return new Promise(async (resolve, reject) => {
            try {
                const notebook = new BoostNotebook();
                notebook.load(notebookUri.fsPath);
                const cell = findCellByKernel(notebook, outputType) as BoostNotebookCell;
                if (!cell) {
                    resolve('');
                    return;
                }
                resolve(cell.value);
            } catch (error) {
                reject(error);
            }
        });
    }

    _summarizeCellsAsSingleInput(
        sourceCells : (vscode.NotebookCell | BoostNotebookCell)[],
        usingBoostNotebook : boolean,
        outputType : string) : string[] {

        // grab all the cell contents by type/command/kernel for submission
        const inputs: string[] = [];
        for (const cellToSummarize of sourceCells) {
            if (usingBoostNotebook) {
                const cell = cellToSummarize as BoostNotebookCell;
                cell.outputs.filter((output) => output.metadata?.outputType === outputType).forEach((output) => {
                    output.items.forEach((item) => {
                        if (item.data && !this._isEmptySummary(item.data)) {
                            inputs.push(cleanCellOutput(item.data));
                        }
                    });
                });
            } else {
                const cell = cellToSummarize as vscode.NotebookCell;
                cell.outputs.filter((output) => output.metadata?.outputType === outputType).forEach((output) => {
                    output.items.forEach((item) => {
                        const decodedText = new TextDecoder().decode(item.data);
                        if (decodedText && !this._isEmptySummary(decodedText)) {
                            inputs.push(cleanCellOutput(decodedText));
                        }
                    });
                });
            }
        }
    
        return inputs;
    }

    async onBoostServiceRequest(
        cell : vscode.NotebookCell | BoostNotebookCell | undefined,
        serviceEndpoint : string,
        payload : any) : Promise<string>
    {
        const usingBoostNotebook = cell?"value" in cell:true; // look for the value property to see if its a BoostNotebookCell

        //  dynamically add payload properties to send to Boost service
        payload.analysis_type = cell?.metadata?.analysis_type;
        payload.analysis_label = cell?.metadata?.analysis_label;
        payload.model = cell?.metadata?.model;
        
        delete payload.inputs;
        let countOfInputs = 1;
        while (cell?.metadata) {
            if (!cell.metadata[`${this.chunkedInputPrefix}${countOfInputs - 1}`]) {
                break;
            }
            payload[`${this.chunkedInputPrefix}${countOfInputs - 1}`] = cell.metadata[`${this.chunkedInputPrefix}${countOfInputs - 1}`];
            countOfInputs++;
        }
        payload.chunks = countOfInputs - 1;
        payload.chunk_prefix = this.chunkedInputPrefix;

        return super.onBoostServiceRequest(cell, serviceEndpoint, payload);
    }

    onKernelOutputItem(
        response: any,
        _ : vscode.NotebookCell | BoostNotebookCell,
        __ : any) : string {

        if (response.analysis === undefined) {
            throw new Error("Unexpected missing analysis from Boost Service");
        } else if (response.analysis_label === undefined) {
            throw new Error("Unexpected missing analysis label from Boost Service");
        } else if (response.analysis_type === undefined) {
            throw new Error("Unexpected missing analysis type from Boost Service");
        }

        return `\n\n---\n\n### Boost ${response.analysis_label} Summary\n\nLast Updated: ${this.currentDateTime}\n\n${response.analysis}`;
    }

    localizeError(error: Error): Error {
        error.message = summaryFailedPrefix + error.message;
        return error;
    }
}

