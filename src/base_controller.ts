import axios from 'axios';
import * as vscode from 'vscode';
import { NOTEBOOK_TYPE } from './extension';
import { BoostConfiguration } from './boostConfiguration';
import { boostLogging } from './boostLogging';
import { fetchGithubSession, getCurrentOrganization } from './authorization';
import { mapError } from './error';
import { BoostNotebookCell, BoostNotebook, SerializedNotebookCellOutput } from './jupyter_notebook';
import { exec } from 'child_process';

// eslint-disable-next-line @typescript-eslint/naming-convention
export type onServiceErrorHandler = (context: vscode.ExtensionContext, error: any, closure: any) => void;

export class KernelControllerBase {
    _problemsCollection: vscode.DiagnosticCollection;
	id : string;
	kernelLabel : string;
    description : string;
    command : string;
	private _supportedLanguages = [];
    private _outputType : string;
    private _useGeneratedCodeCellOptimization : boolean;
    private useOriginalCodeCheck = false;

	private _executionOrder = 0;
	private readonly _controller: vscode.NotebookController;
    public context: vscode.ExtensionContext;
    private otherThis : any;

	constructor(
        problemsCollection: vscode.DiagnosticCollection,
        kernelId : string,
        kernelLabel : string,
        description : string,
        outputType : string,
        useGeneratedCodeCellOptimization : boolean,
        useOriginalCodeCheck : boolean,
        context: vscode.ExtensionContext,
        otherThis : any,
        onServiceErrorHandler: onServiceErrorHandler) {
            
        this._problemsCollection = problemsCollection;
        this.command = kernelId;
        this.id = "polyverse-boost-" + kernelId + "-kernel";
        this.kernelLabel = "Polyverse Boost: " + kernelLabel;
        this.description = description;
        this._outputType = outputType;
        this._useGeneratedCodeCellOptimization = useGeneratedCodeCellOptimization;
        this.useOriginalCodeCheck = useOriginalCodeCheck;
        this.context = context;
        this.otherThis = otherThis;
        this._onServiceError = onServiceErrorHandler;

		this._controller = vscode.notebooks.createNotebookController(this.id,
			NOTEBOOK_TYPE,
			this.kernelLabel);

		this._controller.supportedLanguages = this._supportedLanguages;
		this._controller.supportsExecutionOrder = true;
		this._controller.executeHandler = this._executeAll.bind(this);
	}

	dispose(): void {
		this._controller.dispose();
	}

    get outputType() : string {
        return this._outputType;
    }

    get serviceEndpoint() : string {
        throw new Error('serviceEndpoint not implemented');
    }

    get currentDateTime() : string {
        return new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: 'numeric',
            minute: 'numeric',
            second: 'numeric',
            timeZoneName: 'short'
            });
    }

	private async _executeAll(
        cells: vscode.NotebookCell[],
        notebook: vscode.NotebookDocument,
        controller: vscode.NotebookController): Promise<void> {

        return this.executeAllWithAuthorization(cells, notebook);
	}

	async executeAllWithAuthorization(
        cells: vscode.NotebookCell[] | BoostNotebookCell[],
        notebook: vscode.NotebookDocument | BoostNotebook): Promise<void> {

		// make sure we're authorized
		// if not, run the authorization cell
		const session = await this.doAuthorizationExecution();

		//if not authorized, give up
		if (!session) {
			return;
		}

        if (notebook instanceof BoostNotebook) {
            throw new Error("Method not implemented.");
        }

        this.executeAll(cells as vscode.NotebookCell[], notebook as vscode.NotebookDocument, session);
	}

    executeAll(
        cells: vscode.NotebookCell[] | BoostNotebookCell[],
        notebook: vscode.NotebookDocument | BoostNotebook,
        session : vscode.AuthenticationSession) {

        let successfullyCompleted = true;
        const promises = [];
        for (const cell of cells) {
            //if the cell is generated code, don't run it by default, the original code cell will
			// run it, unless it is the only cell in array of cells being run, in which case, run it
			if (this._useGeneratedCodeCellOptimization &&
                cell.metadata?.type === 'generatedCode' &&
                cells.length > 1) {
				return;
			}
            promises.push(
                this.doExecution(notebook, cell, session).then((result) => {
                    if (!result) {
                        successfullyCompleted = false;
                    }
                }) as Promise<boolean>);
		}
        Promise.all(promises).then((results) => {
            results.forEach((result) => {
                successfullyCompleted &&= (result ?? true);
            });
            if (!successfullyCompleted) {
                boostLogging.error(`Error analyzing Notebook ${notebook.uri.toString()}`);
            }
            return successfullyCompleted;
          }).catch((error) => {
            successfullyCompleted = false;
            boostLogging.error(`Error analyzing Notebook ${notebook.uri.toString()}: ${error.toString()}}`);
        });
    }

	async doExecution(
        notebook : vscode.NotebookDocument | BoostNotebook,
        cell: vscode.NotebookCell | BoostNotebookCell,
        session : vscode.AuthenticationSession):
            Promise<boolean> {

        // if not authorized, retry
        if (!session) {
		    session = await this.doAuthorizationExecution();
        }
		//if still not authorized, give up
		if (!session) {
			return false;
		}

        //if cell is undefined or metadata is undefined, seems like this should never happen
        //  since all cells have metadata
        if (!cell || !cell.metadata) {
            return false;
        }

        // now get the current organization
        let organization = await getCurrentOrganization(this.context);
        if (!organization) {
            return false;
        }

        // if no useful text to explain, skip it
        const inputData = (cell instanceof BoostNotebookCell)? cell.source : cell.document.getText();
        
        // skip whitespace trim on MultilineString - not worth code complexity trouble for now
        if (typeof inputData === "string" && (inputData as string).trim().length === 0) {
            return true;
        } else if (!cell.metadata.type) {
            const reinitialized = await this.initializeMetaData(notebook, cell);
            if (!reinitialized) {
                boostLogging.warn(`Unable to parse contents of Cell ${(cell instanceof BoostNotebookCell)? cell.id : cell.document.uri.toString()}`);
                return false;
            }
        }

		// we basically run two executions, one for the original code to generate a summary
		// and one for the generated code
		// if the cell is original code, run the summary generation
		if (!this.useOriginalCodeCheck || cell.metadata.type === 'originalCode') {
            return await this._doKernelExecution(cell, session, organization);
        }
        return true;
    }

	private async _doKernelExecution(
        cell: vscode.NotebookCell | BoostNotebookCell,
        session: vscode.AuthenticationSession,
        organization: string): Promise<boolean> {

        const execution = (cell instanceof BoostNotebookCell)? undefined : this._controller.createNotebookCellExecution(cell);
        let successfullyCompleted = true;

        const startTime = Date.now();
        if (execution) {
            execution.executionOrder = ++this._executionOrder;
            execution.start(startTime);
        }
        const usingBoostNotebook = cell instanceof BoostNotebookCell;

        // get the code from the cell
        const code = usingBoostNotebook? cell.source : cell.document.getText();

        let payload = {
            code: code,
            session: session.accessToken,
            organization: organization
        };

        const cellId = usingBoostNotebook?cell.id:(cell as vscode.NotebookCell).document.uri.toString();
        try {
            let response = await this.onProcessServiceRequest(execution, cell, payload);
            if (response instanceof Error) {
                // we failed the call, but it was already logged since it didn't throw, so just report failure
                successfullyCompleted = false;
            }
        } catch (err) {
            successfullyCompleted = false;
            this._updateCellOutput(
                execution, cell,
                vscode.NotebookCellOutputItem.error(this.localizeError(err as Error)),
                err);
            boostLogging.error(`Error executing cell ${cellId}: ${(err as Error).message}`, false);
            if (!usingBoostNotebook) {
                this.addDiagnosticProblem(cell, err as Error);
            }
        }
        finally {
            const duration = Date.now() - startTime;
            const minutes = Math.floor(duration / 60000);
            const seconds = ((duration % 60000) / 1000).toFixed(0);
            if (execution) {
                execution.end(successfullyCompleted, Date.now());
            }
            
            if (successfullyCompleted) {
                boostLogging.info(`SUCCESS processing command ${this.command} on cell:${cellId} in ${minutes}:${seconds.padStart(2, '0')} seconds`, false);
            } else {
                boostLogging.error(`FAILED processing command ${this.command} on cell:${cellId} in ${minutes}:${seconds.padStart(2, '0')} seconds`, false);
            }
        }
        return successfullyCompleted;
	}

    // allow derived classes to override the error - e.g. change the error message
    localizeError(error: Error): Error {
        return error;
    }

    _onServiceError : onServiceErrorHandler | undefined = undefined;

    async onProcessServiceRequest(
        execution: vscode.NotebookCellExecution | undefined,
        cell : vscode.NotebookCell | BoostNotebookCell,
        payload : any) : Promise<any>{

        let successfullyCompleted = true;
        const usingBoostNotebook = cell instanceof BoostNotebookCell;

        // using axios, make a web POST call to Boost Service with the code as in a json object code=code
        let response;
        let serviceError : Error = new Error();
        try {
            response = await this.makeBoostServiceRequest(cell, this.serviceEndpoint, payload);
        } catch (err : any) {
            successfullyCompleted = false;
            serviceError = err;
        }
        if (response instanceof Error) {
            successfullyCompleted = false;
            serviceError = response as Error;
        } else if (response === undefined) {
            throw new Error("Unexpected empty result from Boost Service");
        } else if (response.data instanceof Error) {
            successfullyCompleted = false;
            serviceError = response.data as Error;
        }

        // we wrap mimeTypes in an object so that we can pass it by reference and change it
        let mimetype = { str: 'text/markdown'};

        const outputItem =
            successfullyCompleted?
            vscode.NotebookCellOutputItem.text(
                this.onKernelOutputItem(response, cell, mimetype), mimetype.str):
            vscode.NotebookCellOutputItem.error(this.localizeError(serviceError as Error));

        this._updateCellOutput(execution, cell, outputItem, serviceError);
        if (!successfullyCompleted) {
            const cellId = usingBoostNotebook?cell.id : cell.document.uri.toString();
            boostLogging.error(`Error in cell ${cellId}: ${serviceError.message}`, false);
            if (!usingBoostNotebook) {
                this.addDiagnosticProblem(cell, serviceError as Error);
            }
        }

        return response;
    }

    private _updateCellOutput(
        execution: vscode.NotebookCellExecution | undefined,
        cell : vscode.NotebookCell | BoostNotebookCell,
        outputItem : vscode.NotebookCellOutputItem | SerializedNotebookCellOutput,
        err: unknown) {

        const usingBoostNotebook = cell instanceof BoostNotebookCell;

        if (usingBoostNotebook || !execution) {
            (cell as BoostNotebookCell).updateOutputItem( this._outputType, outputItem as SerializedNotebookCellOutput);
            return;
        }
        
        const outputItems: vscode.NotebookCellOutputItem[] = [outputItem as vscode.NotebookCellOutputItem];

        // we will have one NotebookCellOutput per type of output.
        // first scan the existing outputs of the cell and see if we already have an output of this type
        // if so, replace it
        let existingOutputs = cell.outputs;
        let existingOutput = existingOutputs.find(
            output => output.metadata?.outputType === this._outputType);
        if (existingOutput) {
            execution.replaceOutputItems(outputItems, existingOutput);
        } else {
            // create a new NotebookCellOutput with the outputItems array
            const output = new vscode.NotebookCellOutput(outputItems, { outputType: this._outputType });

            execution.appendOutput(output);
        }
    }

    async makeBoostServiceRequest(
        cell : vscode.NotebookCell | BoostNotebookCell,
        serviceEndpoint : string,
        payload : any): Promise<any> {
        try {
            if (BoostConfiguration.serviceFaultInjection > 0 &&
                (Math.floor(Math.random() * 100) < BoostConfiguration.serviceFaultInjection)) {;
                const cellId = (cell instanceof BoostNotebookCell)?cell.id : cell.document.uri.toString();
                boostLogging.debug(`Injecting fault into service request for cell ${cellId} to ${serviceEndpoint}`);
                await axios.get('https://serviceFaultInjection/synthetic/error/');
            }
            let result : any = await this.onBoostServiceRequest(cell, serviceEndpoint, payload);
            if (result.error) { // if we have an error, throw it - this is generally happens with the local service shim
                return new Error(`Boost Service failed with a network error: ${result.error}`);
            }
            return result;
        } catch (err : any) {
            if (this._onServiceError !== undefined) {
                this._onServiceError(this.context, err as Error, this.otherThis);
            }
            return mapError(err);
        }
    }

    async onBoostServiceRequest(
        cell : vscode.NotebookCell | BoostNotebookCell,
        serviceEndpoint : string,
        payload : any) : Promise<string> {

        const headers = {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            'User-Agent': `Boost-VSCE/${BoostConfiguration.version}`
        };
        
        return axios.post(
            serviceEndpoint,
            payload, { headers }).then((response) => {
                return response.data;
            }).catch((error) => {
                throw error;
            });
    }

    onKernelOutputItem(response: any, cell : vscode.NotebookCell | BoostNotebookCell, mimetype : any) : string {
        throw new Error("Not implemented");
    }

    async initializeMetaData(
        notebook : vscode.NotebookDocument | BoostNotebook,
        cell: vscode.NotebookCell | BoostNotebookCell) : Promise<boolean> {

        if (notebook === undefined) {
            return false;
        }
        const usingBoostNotebook = (notebook instanceof BoostNotebook);

        let foundCell = undefined;
        let i = 0;
        for  (; i < notebook.cellCount; i++) {
            if (notebook.cellAt(i) === cell) {
                foundCell = notebook.cellAt(i);
                break;
            }
        }

        // if we're using native boost notebook, update metadata and skip more complex VSC Notebook update process
        if (usingBoostNotebook) {
            (cell as BoostNotebookCell).initializeMetadata( {"id": i, "type": "originalCode"} );
            return true;
        }

        const doc = (cell as vscode.NotebookCell).document;
        const newCellData = new vscode.NotebookCellData(vscode.NotebookCellKind.Code,
            doc.getText(), doc.languageId);
        newCellData.metadata = {"id": i, "type": "originalCode"};


        const edit = new vscode.WorkspaceEdit();

        // Use .set to add one or more edits to the notebook
        edit.set(notebook.uri, [
            
            // Create an edit that replaces this cell with the same cell + set metadata
            vscode.NotebookEdit.updateCellMetadata(i, newCellData.metadata)

        ]);
        // Additional notebook edits...

        await vscode.workspace.applyEdit(edit);

        // Update the cell reference to the new cell from the replacement so the caller can use it
        cell = notebook.cellAt(i);
        return true;
    }

    async doAuthorizationExecution(): Promise<vscode.AuthenticationSession> {
        return fetchGithubSession();
    }

    public deserializeErrorAsProblems(cell: vscode.NotebookCell, error: Error) {
        // if no target Cell, skip
        if (!cell.document) {
            return;
        }
        // if no error, skip
        else if (!error) {
            boostLogging.debug(`No error to deserialize for cell ${cell.document.uri.toString()}`);
            return;
        }

        // otherwise, add/update problems for this Cell
        this.addDiagnosticProblem(cell, error);
    }

    // relatedUri should be the Uri of the original source file
    addDiagnosticProblem(
            // document should be the Cell's document that has the problem(s)
        cell: vscode.NotebookCell,
            // error should be the Error object that was thrown
        error : Error,
            // severity of the problem
        severity : vscode.DiagnosticSeverity = vscode.DiagnosticSeverity.Error,
            // cellPosition should be the problematic range of the Cell in the Notebook
        cellRange : vscode.Range = new vscode.Range(0, 0, 0, 0),
            // (optional) relatedUri should be the Uri of the original source file
        relatedUri? : vscode.Uri,
              // (optional) relatedRange should be the problematic area in the source file
        relatedRange? : vscode.Range,
        relatedMessage? : string): void {
        
            // if no target Cell, clear all problems
        if (!cell.document) {
            this._problemsCollection.clear();
            return;
        }
        // if no error, clear problems for this Cell
        else if (!error) {
            this._problemsCollection.delete(cell.document.uri);
            return;
        }

        if (!relatedUri && BoostConfiguration.useSourceFileForProblems) {
            relatedUri = vscode.Uri.parse(cell.notebook.metadata.sourceFile??"file:///unknown", true);
        }
        if (!severity) {
            severity = vscode.DiagnosticSeverity.Error;
        }
        if (!cellRange)
        {
            cellRange = new vscode.Range(0,0,0,0);
        }
        this._problemsCollection.set(cell.document.uri, [{
            code: error.name,       // '<CodeBlockContextGoesHere>',
            message: error.message, // '<BoostServiceAnalsysis>',
            range: cellRange,
            severity: severity,
            source: NOTEBOOK_TYPE,

            // provide context for source file
            relatedInformation: relatedUri?[
                new vscode.DiagnosticRelatedInformation(
                    new vscode.Location(
                        relatedUri, relatedRange??new vscode.Position(0,0)),
                    relatedMessage??'Source File')
                ]:undefined
        }]);
    }
}

