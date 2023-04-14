import * as vscode from 'vscode';

import { BoostAnalyzeKernel } from './analyze_controller';
import { BoostTestgenKernel } from './testgen_controller';
import { BoostConvertKernel } from './convert_controller';
import { BoostExplainKernel } from './explain_controller';

import { BoostContentSerializer } from './serializer';
import { parseFunctions } from './split';	
import instructions from './instructions.json';

export const NOTEBOOK_TYPE = 'polyverse-boost-notebook';

export function activate(context: vscode.ExtensionContext) {
    const outputChannel = vscode.window.createOutputChannel(NOTEBOOK_TYPE);

    outputChannel.appendLine('Activating Boost Notebook Extension');

    registerCreateNotebookCommand(context, outputChannel);

    const [selectOutputLanguageButton, selectTestFramework] =
        setupNotebookEnvironment(context, outputChannel);

	// register the select language command
	context.subscriptions.push(vscode.commands.registerCommand(
        NOTEBOOK_TYPE + '.selectOutputLanguage', async () => {
		// Use the vscode.window.showQuickPick method to let the user select a language
		const language = await vscode.window.showQuickPick([
            'python', 'ruby', 'swift', 'rust',
            'javascript', 'typescript', 'csharp' ], {
			canPickMany: false,
			placeHolder: 'Select a language'
		});
		//put the language in the metadata
		const editor = vscode.window.activeNotebookEditor;
		
		const currentNotebook = vscode.window.activeNotebookEditor?.notebook;
		if (currentNotebook) {
			const edit = new vscode.WorkspaceEdit();
			edit.set(currentNotebook.uri, [vscode.NotebookEdit.updateNotebookMetadata({
                outputLanguage: language})]);
			await vscode.workspace.applyEdit(edit);

			//now update the status bar item
			selectOutputLanguageButton.text =
                "Boost: Conversion Output Language is " + language;
		}
	}));

	// register the select framework command
	context.subscriptions.push(vscode.commands.registerCommand(
        NOTEBOOK_TYPE + '.selectTestFramework', async () => {

		//first get the framework from the metadata
		const currentNotebook = vscode.window.activeNotebookEditor?.notebook;
		let framework = "pytest";
		if (currentNotebook) {
			framework = currentNotebook.metadata.testFramework;
		}
		// Use the vscode.window.showQuickPick method to let the user select a framework
		framework = await vscode.window.showInputBox({
			prompt: 'Enter a testing framework',
			placeHolder: framework
		})?? framework;
		//put the framework in the metadata

		if (currentNotebook) {
			const edit = new vscode.WorkspaceEdit();
			edit.set(currentNotebook.uri, [vscode.NotebookEdit.updateNotebookMetadata({
                testFramework: framework})]);
			await vscode.workspace.applyEdit(edit);
			selectTestFramework.text = "Boost: Test Framework is " + framework;
		}
	}));

    registerOpenCodeFile(context, outputChannel);

    registerFileRightClickAnalyzeCommand(context, outputChannel);
}

// for completeness, we provide a deactivate function - asynchronous return
//    if we have resources to cleanup in the future
export async function deactivate(): Promise<void> {
    const outputChannel = vscode.window.createOutputChannel(NOTEBOOK_TYPE);

    outputChannel.appendLine('Deactivating Boost Notebook Extension');
  
    return undefined;
}

function registerCreateNotebookCommand(
    context: vscode.ExtensionContext,
    outputChannel: vscode.OutputChannel) {

	context.subscriptions.push(vscode.commands.registerCommand(
        NOTEBOOK_TYPE + '.createJsonNotebook', async () => {

            // we prepopulate the notebook with the instructions (as markdown)
        const language = 'markdown';
        const defaultInstructionData = instructions.markdown;
		const cell = new vscode.NotebookCellData(vscode.NotebookCellKind.Markup,
            defaultInstructionData, language);
		const data = new vscode.NotebookData([cell]);
		// get the defaults
		const settings = vscode.workspace.getConfiguration(NOTEBOOK_TYPE);

		data.metadata = {};
		data.metadata.outputLanguage = settings.outputLanguage;
		data.metadata.testFramework = settings.testFramework;
		data.metadata.defaultDir = settings.defaultDir;

		const doc = await vscode.workspace.openNotebookDocument(NOTEBOOK_TYPE, data);
		await vscode.window.showNotebookDocument(doc);
	}));}

function setupNotebookEnvironment(
    context: vscode.ExtensionContext,
    outputChannel: vscode.OutputChannel) {

    // create the Problems collection
    const collection = vscode.languages.createDiagnosticCollection(NOTEBOOK_TYPE + '.problems');

	context.subscriptions.push(
		vscode.workspace.registerNotebookSerializer(
			NOTEBOOK_TYPE, new BoostContentSerializer(), { transientOutputs: false }
		),
		new BoostConvertKernel(collection),
		new BoostExplainKernel(collection),
		new BoostAnalyzeKernel(collection),
		new BoostTestgenKernel(collection)
	);

	// get the defaults
	const settings = vscode.workspace.getConfiguration(NOTEBOOK_TYPE);
	const outputLanguage = settings.outputLanguage;
	const testFramework = settings.testFramework;

	const selectOutputLanguageButton = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left);
	selectOutputLanguageButton.text =
        "Boost: Conversion Output Language is " + outputLanguage;
	selectOutputLanguageButton.command = NOTEBOOK_TYPE + '.selectOutputLanguage';
	selectOutputLanguageButton.show();

	// Create a new status bar item with a button
	const selectTestFramework = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left);
	selectTestFramework.text = "Boost: Test Framework is " + testFramework;
	selectTestFramework.command = NOTEBOOK_TYPE + '.selectTestFramework';
	selectTestFramework.show();

    return [selectOutputLanguageButton, selectTestFramework];
}

function registerOpenCodeFile(context: vscode.ExtensionContext,
    outputChannel: vscode.OutputChannel) {
	// Register a command to handle the button click
	context.subscriptions.push(vscode.commands.registerCommand(
        NOTEBOOK_TYPE + '.loadCodeFile', async () => {

        // Get all the cells in the newly created notebook
        const notebookEditor = vscode.window.activeNotebookEditor;
        // this should never happen, if it does, we are doing Notebook operations without a Notebook
        if (notebookEditor === undefined) {
            return; 
        }
    
        // see if the user added any data to the cells - since reloading will destroy it
        const existingCells = notebookEditor.notebook.getCells();
        let userEnteredData = false;
        existingCells.forEach((notebookCell) => {
            if (notebookCell.metadata === undefined &&
                notebookCell.document.getText().trim() === "") {
                    userEnteredData = true;
            }
        });

        if (userEnteredData) {
            vscode.window.showWarningMessage(
                'Existing User-entered data in Cells will be discarded upon loading a new file.');
        }
        else if (existingCells.length > 0) {
            vscode.window.showInformationMessage(
                'Previously loaded code will be discarded upon loading a new file.');
        }

		// Use the vscode.window.showOpenDialog method to let the user select a file
		const fileUri = await vscode.window.showOpenDialog({
			canSelectMany: false,
			openLabel: 'Load Code File',
			filters: {
				// eslint-disable-next-line @typescript-eslint/naming-convention
				'All Files': ['*']
			}
		});

        if (fileUri === undefined || fileUri[0] === undefined) {
            return;
        }
        else if (fileUri.length > 1) {
            vscode.window.showWarningMessage(
                'Only one source file can be loaded at a time.');
        }
    
        parseFunctionsFromFile(fileUri[0]);

	}));	
}

async function parseFunctionsFromFile(fileUri : vscode.Uri) {

    // Use the vscode.workspace.fs.readFile method to read the contents of the file
    const fileContents = await vscode.workspace.fs.readFile(fileUri);

    // turn fileContents into a string and call splitCode
    const fileContentsString = fileContents.toString();
    const [languageId, splitCodeResult] = parseFunctions(
        fileUri.toString(),
        fileContentsString);

    //now loop through the splitCodeResult and create a cell for each item,
    //  adding to an array of cells
    const cells = [];

    for (let i = 0; i < splitCodeResult.length; i++) {
        const cell = new vscode.NotebookCellData(vscode.NotebookCellKind.Code,
            splitCodeResult[i], languageId);
        cell.metadata = {"id": i, "type": "originalCode"};
        cells.push(cell);
    }

    let currentNotebook = vscode.window.activeNotebookEditor?.notebook;
    // if there is no active notebook editor, we need to find it
    // Note this only happens when using right-click in explorer or a non-Notebook active editor
    if (currentNotebook === undefined) {
        const notebookDocuments: vscode.NotebookDocument[] = [];
        vscode.workspace.notebookDocuments.forEach(async (doc) => {
            // we're skipping non Boost notebooks
            if (doc.notebookType !== NOTEBOOK_TYPE) {
                return;
            }
            // we found multiple available Boost notebooks, so warn after first
            if (currentNotebook !== undefined) {
                vscode.window.showWarningMessage(
                    'Multiple Boost Notebooks are open. Using first to load file.');
                return;
            }
          
            vscode.window.showNotebookDocument(doc, {
                viewColumn: vscode.ViewColumn.One // set the editor column to open the notebook in
            });
              
            currentNotebook = doc;
        });
    }
    // if we still failed to find an available Notebook, then warn and give up
    if (currentNotebook === undefined) {
        vscode.window.showWarningMessage(
            'Missing open Boost Notebook. Please create or activate your Boost Notebook first');
        return;
    }

    // if the Notebook has unsaved changes, prompt user before erasing them
    if (currentNotebook.isDirty &&
            // if there are multiple cells, or
        (currentNotebook.cellCount > 1 ||
            // unless there's only one cell and its the default Instructions (e.g. not code)
        currentNotebook.cellCount === 1 && currentNotebook.cellAt(0).kind !== vscode.NotebookCellKind.Markup )) {
        const choice = await vscode.window.showInformationMessage(
            "The default Boost Notebook has unsaved data in it. If you proceed, that data will likely be lost. " +
            "Do you wish to proceed?", { "modal": true}, 'Yes', 'No');
        if (choice !== 'Yes') {
            return;
        }
    }

    // get the range of the cells in the notebook
    const range = new vscode.NotebookRange(0, currentNotebook.cellCount);
    const edit = new vscode.WorkspaceEdit();
    
    // Use .set to add one or more edits to the notebook
    edit.set(currentNotebook.uri, [
        // Create an edit that replaces all the cells in the notebook with new cells created from the file
        vscode.NotebookEdit.replaceCells(range, cells),

        // Additional notebook edits...
    ]);
    await vscode.workspace.applyEdit(edit);
}

function registerFileRightClickAnalyzeCommand(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel) {

    const disposable = vscode.commands.registerCommand(NOTEBOOK_TYPE + '.processCurrentFile',
        async (uri: vscode.Uri) => {
            // if we don't have a file selected, then the user didn't right click
            //      so we need to find the current active editor, if its available
            if (uri === undefined) {
                if (vscode.window.activeTextEditor === undefined) {
                    vscode.window.showWarningMessage("Unable to identify an active file to analyze.");
                    return;
                }
                else {
                    uri = vscode.window.activeTextEditor?.document.uri;
                }
            }
            await parseFunctionsFromFile(uri);
        });
    context.subscriptions.push(disposable);
}