import * as vscode from 'vscode';
import axios from 'axios';

//set a helper variable of the base url.  this should eventually be a config setting
const baseUrl = 'https://y1v33c740m.execute-api.us-west-2.amazonaws.com/api/';
//const baseUrl = 'http://127.0.0.1:8000/';
const testgenUrl = 'https://gylbelpkobvont6vpxp4ihw5fm0iwnto.lambda-url.us-west-2.on.aws/';


export class BoostTestgenKernel {
	private readonly _id = 'polyverse-boost-testgen-kernel';
	private readonly _label = 'Polyverse Boost: Generate Test Cases for Code';
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

	private _executeAll(
        cells: vscode.NotebookCell[],
        _notebook: vscode.NotebookDocument,
        _controller: vscode.NotebookController): void {

		for (const cell of cells) {
			// if the cell is generated code, don't run it by default, the original code cell will
			//   run it, unless it is the only cell in array of cells being run, in which case, run it
			if (cell.metadata.type === 'generatedCode' && cells.length > 1) {
				return;
			}
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
			this._doTestgenExecution(cell, session);
		} 
	}

	private async _doTestgenExecution(cell: vscode.NotebookCell, session: vscode.AuthenticationSession): Promise<void> {

		//if cell is undefined or metadata is undefined, return
		if (!cell || !cell.metadata) {
			return;
		}
		//get the outputLanguage from the language set on the cell, NOT the language set on the notebook
		let outputLanguage = cell.document.languageId;

		//if outputLanguage is undefined, set it to python
		let framework = vscode.window.activeNotebookEditor?.notebook.metadata.testFramework;

		if (!outputLanguage) {
			//vscode.window.showInformationMessage(`No output language set, defaulting to python`);
			outputLanguage = 'python';
		}

		if (!framework) {
			framework = '';
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

			// now take the summary and using axios send it to Boost web service with the summary in a json object summary=summary
			const response2 = await axios.post(testgenUrl, 
				{ code: code, session: session.accessToken, language: outputLanguage, framework: framework});

			const testgen = await response2.data;

			const outputItems: vscode.NotebookCellOutputItem[] = [];

			//quick hack. if the returned string has three backwards apostrophes, then it's in markdown format
			let mimetype = 'text/x-' + outputLanguage;
			let header = '';
			if(testgen.testcode.includes('```')){
				mimetype = 'text/markdown';
				header = '### Boost Test Generation\n';
			} 

			outputItems.push(vscode.NotebookCellOutputItem.text(header + testgen.testcode, mimetype));

			// we will have one NotebookCellOutput per type of output.
			// first scan the existing outputs of the cell and see if we already have an output of this type
			// if so, replace it
			let existingOutputs = cell.outputs;
			let existingOutput = existingOutputs.find(output => output.metadata?.outputType === 'testGeneration');
			if (existingOutput) {
				execution.replaceOutputItems(outputItems, existingOutput);
			} else {
				// create a new NotebookCellOutput with the outputItems array
				const output = new vscode.NotebookCellOutput(outputItems, { outputType: 'testGeneration' });

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
	private async _doAuthorizationExecution(cell: vscode.NotebookCell): Promise<vscode.AuthenticationSession | undefined> {
		const GITHUB_AUTH_PROVIDER_ID = 'github';
		// The GitHub Authentication Provider accepts the scopes described here:
		// https://developer.github.com/apps/building-oauth-apps/understanding-scopes-for-oauth-apps/
		const SCOPES = ['user:email'];

		const session = await vscode.authentication.getSession(GITHUB_AUTH_PROVIDER_ID, SCOPES, { createIfNone: true });

		return session;
	}
}
