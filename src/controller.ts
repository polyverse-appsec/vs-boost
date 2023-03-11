import * as vscode from 'vscode';
import axios from 'axios';

export class BoostKernel {
	private readonly _id = 'polyverse-boost-notebook-kernel';
	private readonly _label = 'Polyverse Boost Notebook Kernel';
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
		const execution = this._controller.createNotebookCellExecution(cell);

		execution.executionOrder = ++this._executionOrder;
		execution.start(Date.now());

		try {
			//make an array of CellOputputItems with the type NotebookCellOutputItem

			// get the code from the cell
			const code = cell.document.getText();

			// using axios, make a web POST call to localhost:8080/explain with the code as in a json object code=code
			const response = await axios.post('http://localhost:8080/explain', { code: code });


			const summarydata = response.data;
			// print the response to the console
			console.log(summarydata);

			// now take the summary and using axios send it to localhost:8080/generate/python with the summary in a json object summary=summary
			const response2 = await axios.post('http://localhost:8080/generate/python', { explanation: summarydata.explanation });

			const generatedCode = await response2.data;

			// print the response to the console
			console.log(generatedCode);



			const outputItems: vscode.NotebookCellOutputItem[] = [];
			// push a new CellOutputItem with the json parsed text of the cell with the markdown string of "this is a test"
			outputItems.push(vscode.NotebookCellOutputItem.text('Summary of code: ' + summarydata.explanation, 'text/markdown'));
			// push a new CellOutputItem with the json parsed text of the cell
			// TODO: turn this to the language of the generated code
			/* VS Code will render these mimetypes as code in a built-in editor:

			text/x-json
			text/x-javascript
			text/x-html
			text/x-rust
			... text/x-LANGUAGE_ID for any other built-in or installed languages.*/

			outputItems.push(vscode.NotebookCellOutputItem.text(generatedCode.code, 'text/x-python'));

			// create a new NotebookCellOutput with the outputItems array
			const output = new vscode.NotebookCellOutput(outputItems);

			execution.replaceOutput(output);

			execution.end(true, Date.now());
		} catch (err) {
			execution.replaceOutput([new vscode.NotebookCellOutput([
				vscode.NotebookCellOutputItem.error(err as Error)
			])]);
			execution.end(false, Date.now());
		}
	}
}
