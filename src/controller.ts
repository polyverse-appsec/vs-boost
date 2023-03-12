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
			//if the cell is generated code, don't run it by default, the original code cell will run it
			if (cell.metadata.type === 'generatedCode') {
				return;
			}
			this._doExecution(cell);
		}
	}

	private async _doExecution(cell: vscode.NotebookCell): Promise<void> {

		// we basically run two executions, one for the original code to generate a summary
		// and one for the generated code

		// if the cell is original code, run the summary generation
		if (cell.metadata.type === 'originalCode') {
			this._doSummaryExecution(cell)
				.then((summaryCell) => {
					if( summaryCell	){
						this._doGeneratedCodeExecution(summaryCell);
					}
				});
		} else if (cell.metadata.type === 'generatedCode') {
			// if the cell is generated code, run the generated code
			this._doGeneratedCodeExecution(cell);
		}
	}

	private async _doSummaryExecution(cell: vscode.NotebookCell): Promise<vscode.NotebookCell | undefined>{

		const execution = this._controller.createNotebookCellExecution(cell);

		execution.executionOrder = ++this._executionOrder;
		execution.start(Date.now());

		const currentId = cell.metadata.id;

		try {
			//make an array of CellOputputItems with the type NotebookCellOutputItem

			// get the code from the cell
			const code = cell.document.getText();

			// using axios, make a web POST call to localhost:8080/explain with the code as in a json object code=code
			const response = await axios.post('http://localhost:8080/explain', { code: code });


			const summarydata = response.data;
			// print the response to the console
			console.log(summarydata);
/*
			const outputItems: vscode.NotebookCellOutputItem[] = [];
			// push a new CellOutputItem with the json parsed text of the cell with the markdown string of "this is a test"
			outputItems.push(vscode.NotebookCellOutputItem.text('Summary of code: ' + summarydata.explanation, 'text/markdown'));

			// create a new NotebookCellOutput with the outputItems array
			const output = new vscode.NotebookCellOutput(outputItems);

			execution.replaceOutput(output);
*/
			execution.end(true, Date.now());

			console.log('done, trying to add cell');
			// now try to add a new cell to the notebook with the generated summary
			const newCell = new vscode.NotebookCellData(vscode.NotebookCellKind.Code, summarydata.explanation, 'markdown');
			const cells = [newCell];
			newCell.metadata = {"id": currentId, "type": "generatedCode"};

			const currentNotebook = vscode.window.activeNotebookEditor?.notebook;
			if (currentNotebook) {
				const edit = new vscode.WorkspaceEdit();
				console.log('adding cell')
				// Use .set to add one or more edits to the notebook
				const nextCell = currentNotebook.getCells()[cell.index + 1];
				//if the next cell exists and has the same metadata, then it's one of ours and we should
				//replace it with the new cell
				if (nextCell && nextCell.metadata.id === currentId) {
					const range = new vscode.NotebookRange(cell.index + 1, cell.index + 2);
					edit.set(currentNotebook.uri, [
						// Create an edit that inserts one or more cells after the first cell in the notebook
						vscode.NotebookEdit.replaceCells(range, cells)
					]);
				} else {
					edit.set(currentNotebook.uri, [
						// Create an edit that inserts one or more cells after the first cell in the notebook
						vscode.NotebookEdit.insertCells(cell.index + 1, cells),
					]);
				}
				await vscode.workspace.applyEdit(edit);
				return currentNotebook.getCells()[cell.index + 1];
				console.log('added cell')
			}
			return undefined;
		} catch (err) {
			execution.replaceOutput([new vscode.NotebookCellOutput([
				vscode.NotebookCellOutputItem.error(err as Error)
			])]);
			execution.end(false, Date.now());
		}
		return undefined;
	}

	private async _doGeneratedCodeExecution(cell: vscode.NotebookCell): Promise<void> {

		//if cell is undefined or metadata is undefined, return
		if (!cell || !cell.metadata) {
			return;
		}
		const currentId = cell.metadata.id;
		const execution = this._controller.createNotebookCellExecution(cell);

		execution.executionOrder = ++this._executionOrder;
		execution.start(Date.now());

		try {
			//make an array of CellOputputItems with the type NotebookCellOutputItem

			// get the code from the cell
			const summarydata = cell.document.getText();

			// using axios, make a web POST call to localhost:8080/explain with the code as in a json object code=code
			//const response = await axios.post('http://localhost:8080/explain', { code: code });


			//const summarydata = response.data;
			// print the response to the console
			console.log(summarydata);

			// now take the summary and using axios send it to localhost:8080/generate/python with the summary in a json object summary=summary
			const response2 = await axios.post('http://localhost:8080/generate/python', { explanation: summarydata });

			const generatedCode = await response2.data;

			// print the response to the console
			console.log(generatedCode);



			const outputItems: vscode.NotebookCellOutputItem[] = [];
		
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
