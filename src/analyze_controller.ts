import * as vscode from 'vscode';
import axios from 'axios';
import { DEBUG_BOOST_LAMBDA_LOCALLY } from './base_controller';

//set a helper variable of the base url.  this should eventually be a config setting
const analyzeUrl = DEBUG_BOOST_LAMBDA_LOCALLY?
    'http://127.0.0.1:8000/analyze':
    'https://iyn66vkb6lmlcb4log6d3ah7d40axgqu.lambda-url.us-west-2.on.aws/';

const outputTypeBugAnalysis = 'bugAnalysis';

export class BoostAnalyzeKernel {
	private readonly _id = 'polyverse-boost-analyze-kernel';
	private readonly _label = 'Polyverse Boost: Analyze Code for Security Vulnerabilities';
	private readonly _supportedLanguages = [];

	private _executionOrder = 0;
	private readonly _controller: vscode.NotebookController;

	constructor() {

		this._controller = vscode.notebooks.createNotebookController(this._id,
			'polyverse-boost-notebook',
			this._label);

		this._controller.supportedLanguages = this._supportedLanguages;
		this._controller.supportsExecutionOrder = true;
		this._controller.executeHandler = this._executeAll.bind(this);
	}

	dispose(): void {
		this._controller.dispose();
	}

	private async _executeAll(cells: vscode.NotebookCell[], _notebook: vscode.NotebookDocument, _controller: vscode.NotebookController): Promise<void> {
		// make sure we're authorized
		// if not, run the authorization cell
		const session = await this._doAuthorizationExecution();

        for (const cell of cells) {
			//if the cell is generated code, don't run it by default, the original code cell will
			// run it, unless it is the only cell in array of cells being run, in which case, run it
			if (cell.metadata.type === 'generatedCode' && cells.length > 1) {
				return;
			}
			this._doExecution(cell, session);
		}
	}

	private async _doExecution(cell: vscode.NotebookCell, session : vscode.AuthenticationSession) : Promise<void> {

        // if not authorized, retry
        if (!session) {
		    session = await this._doAuthorizationExecution();
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
            const reinitialized = await this._initializeMetaData(cell);
            if (!reinitialized) {

                vscode.window.showInformationMessage(
                    'Unable to parse contents of Cell');
                return;
            }
        }

		// we basically run two executions, one for the original code to generate a summary
		// and one for the generated code

		
		// if the cell is original code, run the summary generation
		if (cell.metadata.type === 'originalCode') {
			this._doAnalyzeExecution(cell, session);
		} 
	}

	private async _doAnalyzeExecution(cell: vscode.NotebookCell, session: vscode.AuthenticationSession): Promise<void> {


        //get the outputLanguage from the metadata on the notebook editor, default to python
		let outputLanguage = vscode.window.activeNotebookEditor?.notebook.metadata.outputLanguage;
		//if outputLanguage is undefined, set it to python
		if (!outputLanguage) {
			//vscode.window.showInformationMessage(`No output language set, defaulting to python`);
			outputLanguage = 'python';
		}
	
		//vscode.window.showInformationMessage(`Got: ${outputLanguage}`);
		const currentId = cell.metadata.id;
		const execution = this._controller.createNotebookCellExecution(cell);

		execution.executionOrder = ++this._executionOrder;
        let successfulExecution = true;
		execution.start(Date.now());

		try {
			//make an array of CellOputputItems with the type NotebookCellOutputItem

			// get the code from the cell
			const code = cell.document.getText();

			// now take the summary and using axios send it to Boost web service
            //    with the summary in a json object summary=summary
			const response2 = await axios.post(analyzeUrl, 
				{ code: code, session: session.accessToken});

			const analysis = await response2.data;

			const outputItems: vscode.NotebookCellOutputItem[] = [];

			//quick hack. if the returned string has three backwards apostrophes, then it's in markdown format
			let mimetype = 'text/markdown';

			outputItems.push(vscode.NotebookCellOutputItem.text("### Boost Code Analysis\n" + analysis.analysis, mimetype));

			// we will have one NotebookCellOutput per type of output.
			// first scan the existing outputs of the cell and see if we already have an output of this type
			// if so, replace it
			let existingOutputs = cell.outputs;
			let existingOutput = existingOutputs.find(output => output.metadata?.outputType === outputTypeBugAnalysis);
			if (existingOutput) {
				execution.replaceOutputItems(outputItems, existingOutput);
			} else {
				// create a new NotebookCellOutput with the outputItems array
				const output = new vscode.NotebookCellOutput(outputItems, { outputType: outputTypeBugAnalysis });

				execution.appendOutput(output);
			}

		} catch (err) {
            successfulExecution = false;
			execution.appendOutput([new vscode.NotebookCellOutput([
				vscode.NotebookCellOutputItem.error(err as Error)
			])]);
		}
        execution.end(successfulExecution, Date.now());
	}
	private async _doAuthorizationExecution(): Promise<vscode.AuthenticationSession> {
		const GITHUB_AUTH_PROVIDER_ID = 'github';
		// The GitHub Authentication Provider accepts the scopes described here:
		// https://developer.github.com/apps/building-oauth-apps/understanding-scopes-for-oauth-apps/
		const SCOPES = ['user:email'];

		const session = await vscode.authentication.getSession(GITHUB_AUTH_PROVIDER_ID, SCOPES, { createIfNone: true });

		return session;
	}

    private async _initializeMetaData(cell: vscode.NotebookCell) : Promise<boolean> {

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
}
