import * as vscode from 'vscode';
import { BoostKernel } from './controller';
import { BoostContentSerializer } from './serializer';

const NOTEBOOK_TYPE = 'polyverse-boost-notebook';

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(vscode.commands.registerCommand('polyverse-boost-notebook.createJsonNotebook', async () => {
		const language = 'json';
		const defaultValue = `{ "hello_world": 123 }`;
		const cell = new vscode.NotebookCellData(vscode.NotebookCellKind.Code, defaultValue, language);
		const data = new vscode.NotebookData([cell]);
		data.metadata = {
			custom: {
				cells: [],
				metadata: {
					orig_nbformat: 4
				},
				nbformat: 4,
				nbformat_minor: 2
			}
		};
		const doc = await vscode.workspace.openNotebookDocument(NOTEBOOK_TYPE, data);
		await vscode.window.showNotebookDocument(doc);
	}));

	context.subscriptions.push(
		vscode.workspace.registerNotebookSerializer(
			NOTEBOOK_TYPE, new BoostContentSerializer(), { transientOutputs: true }
		),
		new BoostKernel()
	);
	// Create a new status bar item with a button
	const loadCodeFileButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
	loadCodeFileButton.text = "$(file-directory) Load Code File";
	loadCodeFileButton.command = 'polyverse-boost-notebook.loadCodeFile';
	loadCodeFileButton.show();

	// Register a command to handle the button click
	context.subscriptions.push(vscode.commands.registerCommand('polyverse-boost-notebook.loadCodeFile', async () => {
		// Use the vscode.window.showOpenDialog method to let the user select a file
		const fileUri = await vscode.window.showOpenDialog({
			canSelectMany: false,
			openLabel: 'Load Code File',
			filters: {
				'All Files': ['*']
			}
		});

		if (fileUri && fileUri[0]) {
			// Use the vscode.workspace.fs.readFile method to read the contents of the file
			const fileContents = await vscode.workspace.fs.readFile(fileUri[0]);

			// Create a new cell with the contents of the file
			const language = 'typescript';
			const cell = new vscode.NotebookCellData(vscode.NotebookCellKind.Code, fileContents.toString(), language);

		}
	}));
}
