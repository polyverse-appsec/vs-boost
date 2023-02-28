import * as vscode from 'vscode';

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

			const outputItems: vscode.NotebookCellOutputItem[] = [];
			// push a new CellOutputItem with the json parsed text of the cell with the markdown string of "this is a test"
			outputItems.push(vscode.NotebookCellOutputItem.text('#this is a test of markdown', 'text/markdown'));
			// push a new CellOutputItem with the json parsed text of the cell
			outputItems.push(vscode.NotebookCellOutputItem.text('print(\'this is the code.\')', 'text/html'));

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
