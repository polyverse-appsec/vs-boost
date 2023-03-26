import * as vscode from 'vscode';
import { BoostKernel } from './controller';
import { BoostAnalyzeKernel } from './analyze_controller';
import { BoostTestgenKernel } from './testgen_controller';
import { BoostContentSerializer } from './serializer';
import { parseFunctions } from './split';	
import instructions from './instructions.json';

const NOTEBOOK_TYPE = 'polyverse-boost-notebook';

export function activate(context: vscode.ExtensionContext) {
	context.subscriptions.push(vscode.commands.registerCommand('polyverse-boost-notebook.createJsonNotebook', async () => {
		const language = 'markdown';
		const defaultValue = instructions.markdown;
		const cell = new vscode.NotebookCellData(vscode.NotebookCellKind.Code, defaultValue, language);
		const data = new vscode.NotebookData([cell]);
		const doc = await vscode.workspace.openNotebookDocument(NOTEBOOK_TYPE, data);
		await vscode.window.showNotebookDocument(doc);
	}));

	context.subscriptions.push(
		vscode.workspace.registerNotebookSerializer(
			NOTEBOOK_TYPE, new BoostContentSerializer(), { transientOutputs: false }
		),
		new BoostKernel(),
		new BoostAnalyzeKernel(),
		new BoostTestgenKernel()
	);
	// Create a new status bar item with a button
	const loadCodeFileButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
	loadCodeFileButton.text = "Boost: Load Code File";
	loadCodeFileButton.command = 'polyverse-boost-notebook.loadCodeFile';
	loadCodeFileButton.show();

	const selectOutputLanguageButton = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
	selectOutputLanguageButton.text = "Boost: Conversion Output Language (current: Python)";
	selectOutputLanguageButton.command = 'polyverse-boost-notebook.selectOutputLanguage';
	selectOutputLanguageButton.show();
	
	// register the select language command
	context.subscriptions.push(vscode.commands.registerCommand('polyverse-boost-notebook.selectOutputLanguage', async () => {
		// Use the vscode.window.showQuickPick method to let the user select a language
		const language = await vscode.window.showQuickPick(['python', 'ruby', 'swift', 'rust', 'javascript', 'typescript', 'csharp' ], {
			canPickMany: false,
			placeHolder: 'Select a language'
		});
		//put the language in the metadata
		const editor = vscode.window.activeNotebookEditor;
		
		const currentNotebook = vscode.window.activeNotebookEditor?.notebook;
		if (currentNotebook) {
			const edit = new vscode.WorkspaceEdit();
			edit.set(currentNotebook.uri, [vscode.NotebookEdit.updateNotebookMetadata({outputLanguage: language})]);
			await vscode.workspace.applyEdit(edit);
			//now update the status bar item
			selectOutputLanguageButton.text = "Boost: Conversion Output Language (current: " + language + ")";
		}
	}));

	// register the select framework command
	context.subscriptions.push(vscode.commands.registerCommand('polyverse-boost-notebook.selectTestFramework', async () => {

		//first get the framework from the metadata
		const currentNotebook = vscode.window.activeNotebookEditor?.notebook;
		let framework = "pytest";
		if (currentNotebook) {
			framework = currentNotebook.metadata.framework;
		}
		// Use the vscode.window.showQuickPick method to let the user select a framework
		framework = await vscode.window.showInputBox({
			prompt: 'Enter a testing framework',
			placeHolder: framework
		})?? framework;
		//put the framework in the metadata

		if (currentNotebook) {
			const edit = new vscode.WorkspaceEdit();
			edit.set(currentNotebook.uri, [vscode.NotebookEdit.updateNotebookMetadata({framework: framework})]);
			await vscode.workspace.applyEdit(edit);
		}
	}));
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

			// turn fileContents into a string and call splitCode
			const fileContentsString = fileContents.toString();
			const [languageId, splitCodeResult] = parseFunctions(fileUri[0].toString(), fileContentsString);



			//now loop through the splitCodeResult and create a cell for each item, adding to an array of cells
			const cells = [];

			for (let i = 0; i < splitCodeResult.length; i++) {
				const cell = new vscode.NotebookCellData(vscode.NotebookCellKind.Code, splitCodeResult[i], languageId);
				cell.metadata = {"id": i, "type": "originalCode"};
				cells.push(cell);
			}

			const currentNotebook = vscode.window.activeNotebookEditor?.notebook;
			if (currentNotebook) {
				// get the range of the cells in the notebook
				const range = new vscode.NotebookRange(0, currentNotebook.cellCount);
				const edit = new vscode.WorkspaceEdit();
				
				// Use .set to add one or more edits to the notebook
				edit.set(currentNotebook.uri, [
					// Create an edit that inserts one or more cells after the first cell in the notebook
					vscode.NotebookEdit.replaceCells(range, cells),

					// Additional notebook edits...
				]);
				await vscode.workspace.applyEdit(edit);
			}
		}
	}));	
}
