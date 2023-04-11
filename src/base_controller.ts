import axios from 'axios';
import * as vscode from 'vscode';

export const DEBUG_BOOST_LAMBDA_LOCALLY = false;

export class KernelControllerBase {
	id : string;
	kernelLabel : string;
	private _supportedLanguages = [];
    private _serviceEndpoint : string;
    private _outputType : string;
    private _useGeneratedCodeCellOptimization : boolean;
    private useOriginalCodeCheck = false;

	private _executionOrder = 0;
	private readonly _controller: vscode.NotebookController;

	constructor(
        kernelId : string,
        kernelLabel : string,
        serviceEndpoint : string,
        outputType : string,
        useGeneratedCodeCellOptimization : boolean,
        useOriginalCodeCheck : boolean) {
            
        this.id = kernelId;
        this.kernelLabel = kernelLabel;
        this._serviceEndpoint = serviceEndpoint;
        this._outputType = outputType;
        this._useGeneratedCodeCellOptimization = useGeneratedCodeCellOptimization;
        this.useOriginalCodeCheck = useOriginalCodeCheck;

		this._controller = vscode.notebooks.createNotebookController(this.id,
			'polyverse-boost-notebook',
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

	private async _executeAll(
        cells: vscode.NotebookCell[],
        _notebook: vscode.NotebookDocument,
        _controller: vscode.NotebookController): Promise<void> {

		// make sure we're authorized
		// if not, run the authorization cell
		const session = await this.doAuthorizationExecution();

		//if not authorized, give up
		if (!session) {
			return;
		}

        for (const cell of cells) {
            //if the cell is generated code, don't run it by default, the original code cell will
			// run it, unless it is the only cell in array of cells being run, in which case, run it
			if (this._useGeneratedCodeCellOptimization &&
                cell.metadata.type === 'generatedCode' &&
                cells.length > 1) {
				return;
			}
			this._doExecution(cell, session);
		}
	}

	private async _doExecution(cell: vscode.NotebookCell, session : vscode.AuthenticationSession): Promise<void> {
        // if not authorized, retry
        if (!session) {
		    session = await this.doAuthorizationExecution();
        }
		//if still not authorized, give up
		if (!session) {
			return;
		}

        //if cell is undefined or metadata is undefined, seems like this should never happen
        //  since all cells have metadata
        if (!cell || !cell.metadata) {
            return;
        }

        // if no useful text to explain, skip it
        const code = cell.document.getText();

        if (code.trim().length === 0) {
            return;
        } else if (!cell.metadata.type) {
            const reinitialized = await this.initializeMetaData(cell);
            if (!reinitialized) {

                vscode.window.showInformationMessage(
                    'Unable to parse contents of Cell');
                return;
            }
        }

		// we basically run two executions, one for the original code to generate a summary
		// and one for the generated code
		// if the cell is original code, run the summary generation
		if (!this.useOriginalCodeCheck || cell.metadata.type === 'originalCode') {
            await this._doKernelExecution(cell, session);
        }
    }

	private async _doKernelExecution(
        cell: vscode.NotebookCell,
        session: vscode.AuthenticationSession): Promise<void> {
		const execution = this._controller.createNotebookCellExecution(cell);

        let successfullyCompleted = true;
		execution.executionOrder = ++this._executionOrder;
		execution.start(Date.now());

        // get the code from the cell
        const code = cell.document.getText();

        try {
            await this.onProcessServiceRequest(execution, cell, { code: code, session: session.accessToken });
        } catch (err) {
            successfullyCompleted = false;
            this._writeUnhandledError(execution, err);
        }
        finally {
            execution.end(successfullyCompleted, Date.now());
        }
	}

    async onProcessServiceRequest(
        execution: vscode.NotebookCellExecution,
        cell : vscode.NotebookCell,
        payload : any) : Promise<any>{

        let successfullyCompleted = true;

        // using axios, make a web POST call to Boost Service with the code as in a json object code=code
        let response;
        let serviceError : Error = new Error();
        try {
            response = await this.makeBoostServiceRequest(cell, this._serviceEndpoint, payload);
        } catch (err : any) {
            successfullyCompleted = false;
            serviceError = err;
        }

        const outputItems: vscode.NotebookCellOutputItem[] = [];

        let mimetype = { str: 'text/markdown'};

        outputItems.push(successfullyCompleted?
            vscode.NotebookCellOutputItem.text(
                this.onKernelOutputItem(response, cell, mimetype), mimetype.str):
            vscode.NotebookCellOutputItem.error(serviceError as Error));
    

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
        return response;
    }

    private _writeUnhandledError(execution: vscode.NotebookCellExecution, err: unknown) {
        execution.appendOutput([new vscode.NotebookCellOutput([
            vscode.NotebookCellOutputItem.error(err as Error)
        ])]);
    }
    
    async makeBoostServiceRequest(
        cell : vscode.NotebookCell,
        serviceEndpoint : string,
        payload : any): Promise<any> {
        try {
            return await this.onBoostServiceRequest(cell, serviceEndpoint, payload);
        } catch (err : any) {
            if (err.response) {
                switch (err.response.status) {
                    case 401: // authorization error - likely GitHub issue
                        throw new Error(
                            "Unable to use your GitHub authorized account to access the Boost Cloud Service. " +
                            "Please check your GitHub account settings, and try again.");
                    case 502: // bad gateway, possible timeout
                        throw new Error(
                            "Boost code analysis service is currently unavailable. " +
                            "Please try your request again.");
                    default:
                        throw err;
                }
            } else {
                throw err;
            }
        }
    }

    async onBoostServiceRequest(
        cell : vscode.NotebookCell,
        serviceEndpoint : string,
        payload : any) : Promise<string> {

        const response = await axios.post(
            serviceEndpoint,
            payload);
        return response.data;
    }

    onKernelOutputItem(response: any, cell : vscode.NotebookCell, mimetype : any) : string {
        throw new Error("Not implemented");
    }

    async initializeMetaData(cell: vscode.NotebookCell) : Promise<boolean> {

        const currentNotebook = vscode.window.activeNotebookEditor?.notebook;
        if (currentNotebook === undefined) {
            return false;
        }

        const edit = new vscode.WorkspaceEdit();
        let foundCell = undefined;
        let i = 0;
        for  (; i < currentNotebook.cellCount; i++) {
            if (currentNotebook.cellAt(i) === cell) {
                foundCell = currentNotebook.cellAt(i);
                break;
            }
        }

        const newCellData = new vscode.NotebookCellData(vscode.NotebookCellKind.Code,
            cell.document.getText(), cell.document.languageId);
        newCellData.metadata = {"id": i, "type": "originalCode"};

        // Use .set to add one or more edits to the notebook
        edit.set(currentNotebook.uri, [
            
            // Create an edit that replaces this cell with the same cell + set metadata
            vscode.NotebookEdit.updateCellMetadata(i, newCellData.metadata)

        ]);
        // Additional notebook edits...

        await vscode.workspace.applyEdit(edit);

        // Update the cell reference to the new cell from the replacement so the caller can use it
        cell = currentNotebook.cellAt(i);
        return true;
    }

    async doAuthorizationExecution(): Promise<vscode.AuthenticationSession> {
        const GITHUB_AUTH_PROVIDER_ID = 'github';
        // The GitHub Authentication Provider accepts the scopes described here:
        // https://developer.github.com/apps/building-oauth-apps/understanding-scopes-for-oauth-apps/
        const SCOPES = ['user:email'];

        const session = await vscode.authentication.getSession(GITHUB_AUTH_PROVIDER_ID, SCOPES, { createIfNone: true });

        return session;
    }
}