import * as vscode from 'vscode';

import { BoostAnalyzeKernel } from './analyze_controller';
import { BoostTestgenKernel } from './testgen_controller';
import { BoostConvertKernel } from './convert_controller';
import { BoostComplianceKernel } from './compliance_controller';
import { BoostExplainKernel, explainCellMarker } from './explain_controller';
import { BoostCodeGuidelinesKernel } from './codeguidelines_controller';

import { BoostContentSerializer } from './serializer';
import { parseFunctions } from './split';	
import instructions from './instructions.json';
import { BoostConfiguration } from './boostConfiguration';
import { boostLogging } from './boostLogging';
import { KernelControllerBase } from './base_controller';
import { TextDecoder } from 'util';
import * as fs from 'fs';
import * as path from 'path';

export const NOTEBOOK_TYPE = 'polyverse-boost-notebook';

export function activate(context: vscode.ExtensionContext) {
        // ensure logging is shutdown
    context.subscriptions.push(boostLogging);

        // we use a friendly name for the channel as this will be displayed to the user in the output pane
    boostLogging.log('Activating Boost Notebook Extension');

    let result = _setupDiagnosticProblems(context);

    const [selectOutputLanguageButton, selectTestFramework] =
        setupNotebookEnvironment(context, result.problems, result.map);

    registerCreateNotebookCommand(context, result.problems);

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

    registerOpenCodeFile(context);

    registerFileRightClickAnalyzeCommand(context);

    boostLogging.log('Activated Boost Notebook Extension');
    boostLogging.info('Polyverse Boost Notebook Extension is now active');

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
    problems : vscode.DiagnosticCollection) {

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

		data.metadata = {
            outputLanguage : settings.outputLanguage,
            testFramework : settings.testFramework,
            defaultDir : settings.defaultDir
        };

		const doc = await vscode.workspace.openNotebookDocument(NOTEBOOK_TYPE, data);

		const editor = await vscode.window.showNotebookDocument(doc);
	}));}

function setupNotebookEnvironment(
    context: vscode.ExtensionContext,
    collection: vscode.DiagnosticCollection,
    kernelMap : Map<string, KernelControllerBase>) {

        // build a map of output types to kernels so we can reverse lookup the kernels from their output
    let convertKernel = new BoostConvertKernel(collection);
    kernelMap.set(convertKernel.outputType, convertKernel);
    let explainKernel = new BoostExplainKernel(collection);
    kernelMap.set(explainKernel.outputType, explainKernel);
    let analyzeKernel = new BoostAnalyzeKernel(collection);
    kernelMap.set(analyzeKernel.outputType, analyzeKernel);
    let testgenKernel = new BoostTestgenKernel(collection);
    kernelMap.set(testgenKernel.outputType, testgenKernel);
    let complianceKernel = new BoostComplianceKernel(collection);
    kernelMap.set(complianceKernel.outputType, complianceKernel);
    let guidelinesKernel = new BoostCodeGuidelinesKernel(collection);
    kernelMap.set(guidelinesKernel.outputType, guidelinesKernel);

	context.subscriptions.push(
		vscode.workspace.registerNotebookSerializer(
			NOTEBOOK_TYPE, new BoostContentSerializer(), { transientOutputs: false }
		),
        convertKernel,
        analyzeKernel,
        explainKernel,
        testgenKernel,
        complianceKernel,
        guidelinesKernel
	);

	// get the defaults
	const outputLanguage = BoostConfiguration.defaultOutputLanguage;
	const testFramework = BoostConfiguration.testFramework;

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

function registerOpenCodeFile(context: vscode.ExtensionContext) {
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
            boostLogging.warn('Existing User-entered data in Cells will be discarded upon loading a new file.');
        }
        else if (existingCells.length > 0) {
            boostLogging.info('Previously loaded content will be discarded upon loading a new file.');
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
            boostLogging.warn(
                'Only one source file can be loaded at a time.');
        }
    
        await parseFunctionsFromFile(fileUri[0], notebookEditor.notebook);

	}));	
}

async function createNotebookFromSourceFile(fileUri : vscode.Uri) : Promise<vscode.NotebookDocument> {
    const data = new vscode.NotebookData([]);
    const doc = await vscode.workspace.openNotebookDocument(NOTEBOOK_TYPE, data);
    await parseFunctionsFromFile(fileUri, doc);

    // Serialize notebook to .boost file
    const notebookJSON = JSON.stringify(doc);
    const notebookPath = fileUri.fsPath + '.boost';
    fs.writeFileSync(notebookPath, notebookJSON);
    return doc;
}

async function parseFunctionsFromFile(fileUri : vscode.Uri, targetNotebook : vscode.NotebookDocument) {

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

    // if we still failed to find an available Notebook, then warn and give up
    if (targetNotebook === undefined) {
        boostLogging.warn(
            'Missing open Boost Notebook. Please create or activate your Boost Notebook first');
        return;
    }

    // if the Notebook has unsaved changes, prompt user before erasing them
    if (targetNotebook.isDirty &&
            // if there are multiple cells, or
        (targetNotebook.cellCount > 1 ||
            // unless there's only one cell and its the default Instructions (e.g. not code)
        targetNotebook.cellCount === 1 && targetNotebook.cellAt(0).kind !== vscode.NotebookCellKind.Markup )) {
        const choice = await vscode.window.showInformationMessage(
            "The default Boost Notebook has unsaved data in it. If you proceed, that data will likely be lost. " +
            "Do you wish to proceed?", { "modal": true}, 'Yes', 'No');
        if (choice !== 'Yes') {
            return;
        }
    }

    // get the range of the cells in the notebook
    const range = new vscode.NotebookRange(0, targetNotebook.cellCount);
    const edit = new vscode.WorkspaceEdit();
    
    // Use .set to add one or more edits to the notebook
    edit.set(targetNotebook.uri, [
        // Create an edit that replaces all the cells in the notebook with new cells created from the file
        vscode.NotebookEdit.replaceCells(range, cells),

        // Additional notebook edits...
    ]);

    let newMetadata = {
        ...targetNotebook.metadata,
        sourceFile: fileUri.toString()};

    // store the source file on the notebook metadata, so we can use it for problems or reverse mapping
    edit.set(targetNotebook.uri, [vscode.NotebookEdit.updateNotebookMetadata(newMetadata)]);
    await vscode.workspace.applyEdit(edit);
}

function registerFileRightClickAnalyzeCommand(context: vscode.ExtensionContext, ) {

    const disposable = vscode.commands.registerCommand(NOTEBOOK_TYPE + '.processCurrentFile',
        async (uri: vscode.Uri) => {
            // if we don't have a file selected, then the user didn't right click
            //      so we need to find the current active editor, if its available
            if (uri === undefined) {
                if (vscode.window.activeTextEditor === undefined) {
                    boostLogging.warn("Unable to identify an active file to analyze.");
                    return;
                }
                else {
                    uri = vscode.window.activeTextEditor?.document.uri;
                }
            }

            let currentNotebook = vscode.window.activeNotebookEditor?.notebook;
            // if there is no active notebook editor, we need to find it
            // Note this only happens when using right-click in explorer or a non-Notebook active editor
            if (currentNotebook === undefined) {
                const boostNotebooks: vscode.NotebookDocument[] =
                    vscode.workspace.notebookDocuments.filter(async (doc) => {
                    // we're skipping non Boost notebooks
                    return (doc.notebookType === NOTEBOOK_TYPE);
                });

                // if we have more than one notebook, we need to ask user which one to use
                if (boostNotebooks.length > 1) {
                    let notebookNames = boostNotebooks.map((doc) => {
                        return path.basename(vscode.Uri.parse(doc.uri.toString()).fsPath);
                    });

                    // show the user a list of available notebooks
                    const selectedOption = await vscode.window.showQuickPick(notebookNames, {
                        canPickMany: false,
                        placeHolder: 'Select a Boost Notebook to use'
                    });
                    // if user doesn't pick anything, then just give up
                    if (!selectedOption) {
                        return;
                    }
                    // otherwise find the notebook that matches the user's selection
                    currentNotebook = boostNotebooks.find((doc) => {
                        return path.basename(vscode.Uri.parse(doc.uri.toString()).fsPath) === selectedOption;
                    });
                }
                else if (boostNotebooks.length === 1) {
                    // if we only have one notebook, then just use that one
                    currentNotebook = boostNotebooks[0];
                }
            }
            // if we still failed to find an available Notebook, then warn and give up
            if (currentNotebook === undefined) {
                boostLogging.warn(
                    'Missing open Boost Notebook. Please create or activate your Boost Notebook first');
                return;
            }

            await parseFunctionsFromFile(uri, currentNotebook);
        });
    context.subscriptions.push(disposable);
}

function _setupDiagnosticProblems(context: vscode.ExtensionContext) :
    { problems : vscode.DiagnosticCollection,
      map : Map<string, KernelControllerBase> }
     {

    // create the Problems collection
    const problems = vscode.languages.createDiagnosticCollection(NOTEBOOK_TYPE + '.problems');
    const kernelMap = new Map<string, KernelControllerBase>();
    // whenever we open a boost notebook, we need to re-sync the problems (in case errors were persisted with it)
    vscode.workspace.onDidOpenNotebookDocument((event) => {
        if (event.notebookType !== NOTEBOOK_TYPE) {
            return;
        }

        event.getCells().forEach((cell) => {
            cell.outputs.forEach((output) => {
                output.items.forEach((item) => {
                    let thisItem = item as vscode.NotebookCellOutputItem;
                    if (thisItem.mime !== 'application/vnd.code.notebook.error') {
                        return;
                    }

                    // we use the kernel controller that was attached to this output to deserialize the error
                    // If we can't find the kernel controller metadata, then just use the explain controller
                    let kernelBase = kernelMap.get(output.metadata?.outputType ?? explainCellMarker);
                    if (kernelBase) {
                        let deserializedError = newErrorFromItemData(thisItem.data);
                        
                        kernelBase.deserializeErrorAsProblems(cell, deserializedError);
                    }
                    
                });
            });
            _syncProblemsInCell(cell, problems);
        });
    });

    // when the notebook is closed, we need to clear its problems as well
    //    note that problems are tied to the cells, not the notebook
    vscode.workspace.onDidCloseNotebookDocument((event) => {
        if (event.notebookType !== NOTEBOOK_TYPE) {
            return;
        }

        event.getCells().forEach((cell) => {
            problems.delete(cell.document.uri);
        });
    });

    // Register an event listener for the onDidClearOutput event
    const notebookChangeHandler: vscode.Disposable = vscode.workspace.onDidChangeNotebookDocument((event) => {
    
        // when a cell changes
        for (const cellChange of event.cellChanges) {
            // if no outputs changed, skip it
            if (!cellChange.outputs) { continue;}
            
            _syncProblemsInCell(cellChange.cell, problems);
        }

        // when content in a cell changes - look for full deletions of cell
        // Loop through each changed cell content
        for (const changedContent of event.contentChanges) {
            for (const cell of changedContent.removedCells) {
                _syncProblemsInCell(cell, problems, true);
            }
        }
    });

    // Dispose the event listener when it is no longer needed
    context.subscriptions.push(notebookChangeHandler);

    return {problems: problems, map: kernelMap};
}
function _syncProblemsInCell(
    cell: vscode.NotebookCell,
    problems: vscode.DiagnosticCollection,
    cellsBeingRemoved : boolean = false) {
    const cellUri = cell.document.uri;

    
    // if no problems for this cell, skip it
    const thisCellProblems = problems.get(cellUri);
    if (!thisCellProblems || thisCellProblems.length === 0) {
        return;
    }
    
    // Check if the cell has any error output
    const hasErrorOutput = cell.outputs.some((output : any) => {
        for (const item of output.items) {
            return item.mime === 'application/vnd.code.notebook.error';
        }
    });
    // If the cell has error output, check if there are any problems associated with it

    // if the cell has no error output, remove all problems associated with it
    if (!hasErrorOutput) {
        problems.delete(cellUri);
        return;
    }
    const diagnostics: vscode.Diagnostic[] = [];
    // Loop through each problem and check if it can still be matched to an error output
    for (const problem of thisCellProblems) {
        const errorOutputIndex = cell.outputs.findIndex((output) => {
            for (const item of output.items) {
                return item.mime === 'application/vnd.code.notebook.error';//
                //    && output.metadata?.cellId === problem?.source?.toString();
            }
        });
        // Error output found for the problem, add it back to the diagnostics
        // unless the cell is being removed, in which case, we'll drop it (e.g. skip the re-add)
        if (errorOutputIndex !== -1 && !cellsBeingRemoved) {
            diagnostics.push(problem);
        }
    }
    // Replace the problems with the updated diagnostics
    problems.set(cellUri, diagnostics);
}
function newErrorFromItemData(data: Uint8Array) : Error {
    const errorJson = new TextDecoder().decode(data);

    const errorObject = JSON.parse(errorJson, (key, value) => {
      if (key === '') {
        const error = new Error();
        Object.assign(error, value);
        return error;
      }
      return value;
    });
    
    return errorObject;
}

