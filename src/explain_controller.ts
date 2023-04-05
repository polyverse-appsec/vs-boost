import * as vscode from 'vscode';
import axios from 'axios';

//set a helper variable of the base url.  this should eventually be a config setting
const baseUrl = 'https://y1v33c740m.execute-api.us-west-2.amazonaws.com/api/';
//const baseUrl = 'http://127.0.0.1:8000/';
const explainUrl = 'https://jorsb57zbzwcxcjzl2xwvah45i0mjuxs.lambda-url.us-west-2.on.aws/';


export class BoostExplainKernel {
	private readonly _id = 'polyverse-boost-explain-kernel';
	private readonly _label = 'Polyverse Boost: Explain Code';
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

	private _executeAll(cells: vscode.NotebookCell[], _notebook: vscode.NotebookDocument, _controller: vscode.NotebookController): void {
		for (const cell of cells) {
			this._doExecution(cell);
		}
	}

	private async _doExecution(cell: vscode.NotebookCell): Promise<void> {

		// make sure we're authorized
		// if not, run the authorization cell
		const session = await this._doAuthorizationExecution(cell);

		//if not authorized, return
		if (!session) {
			return;
		}

		// we basically run two executions, one for the original code to generate a summary
		// and one for the generated code

		
		// if the cell is original code, run the summary generation
		if (cell.metadata.type === 'originalCode') {
			this._doExplainExecution(cell, session);
		} 
	}

	private async _doExplainExecution(cell: vscode.NotebookCell, session: vscode.AuthenticationSession): Promise<void> {

		//if cell is undefined or metadata is undefined, return
		if (!cell || !cell.metadata) {
			return;
		}

		const execution = this._controller.createNotebookCellExecution(cell);

		execution.executionOrder = ++this._executionOrder;
		execution.start(Date.now());

		try {
			//make an array of CellOputputItems with the type NotebookCellOutputItem

			// get the code from the cell
			const code = cell.document.getText();

			// using axios, make a web POST call to localhost:8080/explain with the code as in a json object code=code
			const response = await axios.post(explainUrl, { code: code, session: session.accessToken });


			const summarydata = response.data;

			const outputItems: vscode.NotebookCellOutputItem[] = [];

			const mimetype = 'text/markdown';
 

			outputItems.push(vscode.NotebookCellOutputItem.text("### Boost Code Explanation\n" + summarydata.explanation, mimetype));

			// we will have one NotebookCellOutput per type of output.
			// first scan the existing outputs of the cell and see if we already have an output of this type
			// if so, replace it
			let existingOutputs = cell.outputs;
			let existingOutput = existingOutputs.find(output => output.metadata?.outputType === 'explainCode');
			if (existingOutput) {
				execution.replaceOutputItems(outputItems, existingOutput);
			} else {
				// create a new NotebookCellOutput with the outputItems array
				const output = new vscode.NotebookCellOutput(outputItems, { outputType: 'explainCode' });

				execution.appendOutput(output);
			}

			execution.end(true, Date.now());

		} catch (err) {
			execution.appendOutput([new vscode.NotebookCellOutput([
				vscode.NotebookCellOutputItem.error(err as Error)
			])]);
			execution.end(false, Date.now());
		}
	}
	private async _doAuthorizationExecution(cell: vscode.NotebookCell): Promise<vscode.AuthenticationSession | undefined> {
		const GITHUB_AUTH_PROVIDER_ID = 'github';
		// The GitHub Authentication Provider accepts the scopes described here:
		// https://developer.github.com/apps/building-oauth-apps/understanding-scopes-for-oauth-apps/
		const SCOPES = ['user:email'];


		const session = await vscode.authentication.getSession(GITHUB_AUTH_PROVIDER_ID, SCOPES, { createIfNone: true });

		return session;
	}
}
