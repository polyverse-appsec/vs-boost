import * as vscode from 'vscode';

import { BoostAnalyzeKernel } from './analyze_controller';
import { BoostTestgenKernel } from './testgen_controller';
import { BoostConvertKernel } from './convert_controller';
import { BoostComplianceKernel } from './compliance_controller';
import { BoostExplainKernel, explainCellMarker } from './explain_controller';
import { BoostCodeGuidelinesKernel } from './codeguidelines_controller';
import { BoostArchitectureBlueprintKernel } from './blueprint_controller';
import { BoostCustomProcessKernel } from './custom_controller';

import { BoostContentSerializer } from './serializer';
import { parseFunctions } from './split';	
import instructions from './instructions.json';
import { BoostConfiguration } from './boostConfiguration';
import { boostLogging } from './boostLogging';
import { KernelControllerBase} from './base_controller';
import { TextDecoder } from 'util';
import { updateBoostStatusColors } from './portal';
import * as fs from 'fs';
import * as path from 'path';
import * as boostnb from './jupyter_notebook';
import { registerCustomerPortalCommand, setupBoostStatus } from './portal';
import { generatePDFforNotebook } from './convert_pdf';

export const NOTEBOOK_TYPE = 'polyverse-boost-notebook';
export const NOTEBOOK_EXTENSION = ".boost-notebook";

export class BoostExtension {
    // for state, we keep it in a few places
    // 1. here, in the extension object.  this should really just be transient state like UI objects
    // 2. in the globalState object.  this is syncronized with the cloud, so stuff like the organization should be kept there
    // 3. in the extension configuration. this is more 'permanent' state. 
    public statusBar: vscode.StatusBarItem | undefined;
    kernels : Map<string, KernelControllerBase> = new Map<string, KernelControllerBase>();
  
    constructor(context: vscode.ExtensionContext) {
        
        // ensure logging is shutdown
        context.subscriptions.push(boostLogging);

        // we use a friendly name for the channel as this will be displayed to the user in the output pane
        boostLogging.log('Activating Boost Notebook Extension');

        let problems = this._setupDiagnosticProblems(context);

        this.setupNotebookEnvironment(context, problems);

        this.registerCreateNotebookCommand(context, problems);

        registerCustomerPortalCommand(context);
        
        setupBoostStatus(context, this);

        // register the select language command
        this.setupKernelCommandPicker(context);
        this.setupKernelStatus(context);

        // register the select language command
        this.setupOutputLanguagePicker(context);

        // register the select framework command
        this.setupTestFrameworkPicker(context);

        this.registerOpenCodeFile(context);

        this.registerFileRightClickAnalyzeCommand(context);

        this.registerFolderRightClickAnalyzeCommand(context);

        this.registerFolderRightClickPdfCommands(context);

        boostLogging.log('Activated Boost Notebook Extension');
        boostLogging.info('Polyverse Boost is now active');
    }

    _setupDiagnosticProblems(context: vscode.ExtensionContext) : vscode.DiagnosticCollection
        {

        // create the Problems collection
        const problems = vscode.languages.createDiagnosticCollection(NOTEBOOK_TYPE + '.problems');

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
                        this.kernels.forEach((value: KernelControllerBase, key: string, kernels: Map<string, KernelControllerBase>) => {
                            if (value !== output.metadata?.outputType ?? explainCellMarker) {
                                return;
                            }
                        
                            let deserializedError = newErrorFromItemData(thisItem.data);
                        
                            value.deserializeErrorAsProblems(cell, deserializedError);
                        });
                        
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
                problems.forEach((value, key) => {
                    boostLogging.debug(`Evaluating ${value.path} against ${cell.document.uri.toString()}`);
                });
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

        return problems;
    }

    kernelCommand : string | undefined = undefined;
    setupKernelCommandPicker(context: vscode.ExtensionContext) {
        context.subscriptions.push(vscode.commands.registerCommand(
            NOTEBOOK_TYPE + '.selectKernelCommand', async () => {
                // Use the vscode.window.showQuickPick method to let the user select kernel
                let availableKernelItems : any[] = [];
                let defaultKernelChoice : string | undefined = undefined;
                this.kernels.forEach((kernel : KernelControllerBase) => {
                    availableKernelItems.push({ label: kernel.command, description: kernel.kernelLabel, details: kernel.description });
                    if (kernel.id === BoostConfiguration.currentKernelCommand) {
                        defaultKernelChoice = kernel.command;
                    }
                });

                const kernelChoice = await vscode.window.showQuickPick(availableKernelItems, {
                    title: "Choose a Kernel to use for processing of all Boost Notebooks and Cells",
                    canPickMany: false,
                    placeHolder: BoostConfiguration.currentKernelCommand??'Select Boost Kernel',
                    matchOnDescription: true,
                    matchOnDetail: true
                });
                if (!kernelChoice) {
                    return;
                }
                if (!this.kernels.get(kernelChoice.label)) {
                    boostLogging.error(`Invalid or unavailable Boost command: ${kernelChoice.label}`);
                    return;
                }
                // store the kernel as current config command - for offline processing
                this.kernelCommand = kernelChoice.label;
                BoostConfiguration.currentKernelCommand = this.kernels.get(kernelChoice.label)?.id as string;
                if (this.kernelStatusBar) {
                    this.kernelStatusBar.text = `Boost Command: ${kernelChoice.label}`;
                }
            }));
    }

    kernelStatusBar : vscode.StatusBarItem | undefined = undefined;

    setupKernelStatus(context: vscode.ExtensionContext) {
        const kernelStatusBar = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left, 9);
        this.kernelStatusBar = kernelStatusBar;

        this.kernelStatusBar.text = "Select Boost Kernel";
        this.kernels.forEach((kernel : KernelControllerBase) => {
            if (kernel.id !== BoostConfiguration.currentKernelCommand) {
                return;
            }
            if (this.kernelStatusBar) {
                this.kernelStatusBar.text = `Boost Command: ${kernel.command}`;
            }
        });
        // if we have a kernel command specified, but didn't match it, the kernel choice is invalid
        if (BoostConfiguration.currentKernelCommand !== undefined &&
            this.kernelStatusBar.text === "Select Boost Kernel") {
            boostLogging.error(`Invalid Boost command: ${BoostConfiguration.currentKernelCommand} - set a valid Boost kernel name in User Settings or reset to default`);
        }

        this.kernelStatusBar.command = NOTEBOOK_TYPE + ".selectKernelCommand";
        this.kernelStatusBar.show();
        context.subscriptions.push(this.kernelStatusBar);
    }

    private setupTestFrameworkPicker(context: vscode.ExtensionContext) {
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
                }) ?? framework;
                //put the framework in the metadata
                if (currentNotebook) {
                    const edit = new vscode.WorkspaceEdit();
                    edit.set(currentNotebook.uri, [vscode.NotebookEdit.updateNotebookMetadata({
                        testFramework: framework
                    })]);
                    await vscode.workspace.applyEdit(edit);
                }
            }));
    }

    private setupOutputLanguagePicker(context: vscode.ExtensionContext) {
        context.subscriptions.push(vscode.commands.registerCommand(
            NOTEBOOK_TYPE + '.selectOutputLanguage', async () => {
                // Use the vscode.window.showQuickPick method to let the user select a language
                const language = await vscode.window.showQuickPick([
                    'python', 'ruby', 'swift', 'rust',
                    'javascript', 'typescript', 'csharp'
                ], {
                    canPickMany: false,
                    placeHolder: 'Select a language'
                });
                //put the language in the metadata
                const editor = vscode.window.activeNotebookEditor;

                const currentNotebook = vscode.window.activeNotebookEditor?.notebook;
                if (currentNotebook) {
                    const edit = new vscode.WorkspaceEdit();
                    edit.set(currentNotebook.uri, [vscode.NotebookEdit.updateNotebookMetadata({
                        outputLanguage: language
                    })]);
                    await vscode.workspace.applyEdit(edit);
                }
            }));
    }

    setupNotebookEnvironment(
        context: vscode.ExtensionContext,
        collection: vscode.DiagnosticCollection) {

            // build a map of output types to kernels so we can reverse lookup the kernels from their output

        let convertKernel = new BoostConvertKernel(context, updateBoostStatusColors.bind(this), this, collection);
        this.kernels.set(convertKernel.command, convertKernel);
        let explainKernel = new BoostExplainKernel(context, updateBoostStatusColors.bind(this), this, collection);
        this.kernels.set(explainKernel.command, explainKernel);
        let analyzeKernel = new BoostAnalyzeKernel(context, updateBoostStatusColors.bind(this), this, collection);
        this.kernels.set(analyzeKernel.command, analyzeKernel);
        let testgenKernel = new BoostTestgenKernel(context, updateBoostStatusColors.bind(this), this, collection);
        this.kernels.set(testgenKernel.command, testgenKernel);
        let complianceKernel = new BoostComplianceKernel(context, updateBoostStatusColors.bind(this), this, collection);
        this.kernels.set(complianceKernel.command, complianceKernel);
        let guidelinesKernel = new BoostCodeGuidelinesKernel(context, updateBoostStatusColors.bind(this), this, collection);
        this.kernels.set(guidelinesKernel.command, guidelinesKernel);
        let blueprintKernel = new BoostArchitectureBlueprintKernel(context, updateBoostStatusColors.bind(this), this, collection);
        this.kernels.set(blueprintKernel.command, blueprintKernel);

        context.subscriptions.push(
            vscode.workspace.registerNotebookSerializer(
                NOTEBOOK_TYPE, new BoostContentSerializer(), { transientOutputs: false }
            ),
            convertKernel,
            analyzeKernel,
            explainKernel,
            testgenKernel,
            complianceKernel,
            guidelinesKernel,
            blueprintKernel
        );

            // if in dev mode, register all dev only kernels
        if (BoostConfiguration.enableDevOnlyKernels) {
            let customProcessKernel = new BoostCustomProcessKernel(context, updateBoostStatusColors.bind(this), this, collection);
            this.kernels.set(customProcessKernel.command, customProcessKernel);
            context.subscriptions.push(customProcessKernel);
        }
    }


    registerCreateNotebookCommand(
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
    
    registerOpenCodeFile(context: vscode.ExtensionContext) {
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
    
            try {
                await parseFunctionsFromFile(fileUri[0], notebookEditor.notebook);
            } catch (error) {
                boostLogging.error(`Unable to Boost file:[${fileUri[0].fsPath.toString()} due to error:${error}`);
            }
    
        }));
    }

    async loadCurrentFolder(uri: vscode.Uri, context: vscode.ExtensionContext) {
        let targetFolder : vscode.Uri;
        // if we don't have a folder selected, then the user didn't right click
        //      so we need to use the workspace folder
        if (uri === undefined) {
            if (vscode.workspace.workspaceFolders === undefined) {
                boostLogging.warn(
                    'Unable to find Workspace Folder. Please open a Project or Folder first');
                return;
            }

            // use first folder in workspace
            targetFolder = vscode.workspace.workspaceFolders[0].uri;
            boostLogging.debug(`Analyzing Project Wide source file in Workspace: ${targetFolder.fsPath}`);
        }
        else {
            targetFolder = uri;
            boostLogging.debug(`Analyzing source files in folder: ${uri.fsPath}`);
        }

        let baseWorkspace;
        if (vscode.workspace.workspaceFolders) {
            baseWorkspace = vscode.workspace.workspaceFolders![0].uri;
        } else {
            baseWorkspace = uri;
        }
        // we're going to search for everything under our target folder, and let the notebook parsing code filter out what it can't handle
        let searchPattern = new vscode.RelativePattern(targetFolder.fsPath, '**/*.*');
        let ignorePattern = await _buildVSCodeIgnorePattern();
        boostLogging.debug("Skipping source files of pattern: " + ignorePattern??"none");
        let files = await vscode.workspace.findFiles(searchPattern, ignorePattern?new vscode.RelativePattern(targetFolder, ignorePattern):"");
            
        boostLogging.debug("Analyzing " + files.length + " files in folder: " + targetFolder);
        try {
            if (BoostConfiguration.processFoldersInASingleNotebook) {
                // we're going to create a single notebook for all the files
                let newNotebook : vscode.NotebookDocument | undefined;
                for (const file of files) {
                    newNotebook = await createNotebookFromSourceFile(file, false, true, newNotebook) as vscode.NotebookDocument;
                }
                if (newNotebook) {
                    // we let user know the new scratch notebook was created
                    boostLogging.warn("Scratch Notebook opened: " + newNotebook.uri.toString(), true);
                }
            } else {
                let newNotebookWaits : any [] = [];

                files.filter(async (file) => {
                    
                    newNotebookWaits.push(createNotebookFromSourceFile(file, true));
                });
                
                await Promise.all(newNotebookWaits)
                    .then((createdNotebooks) => {
                        // we are generally creating one new notebook during this process, but in case, we de-dupe it
                        const newNotebooks = createdNotebooks.filter((value, index, self) => {
                            return self.indexOf(value) === index;
                        });
                        newNotebooks.forEach(async (notebook : boostnb.BoostNotebook) => {
                            // we let user know the new scratch notebook was created
                            boostLogging.info("Boost Notebook created: " + notebook.metadata['sourceFile']);
                        });
                        boostLogging.info(`${newNotebookWaits.length.toString()} Boost Notebooks created for folder ${targetFolder.path}`);
                    })
                    .catch((error) => {
                    // Handle the error here
                        boostLogging.error(`Error Boosting folder ${targetFolder.path} due Error: ${error}`);
                    });
            }
        } catch (error) {
            boostLogging.error(`Error Boosting folder ${targetFolder} due Error: ${error}`);
        }
    }

    registerFolderRightClickAnalyzeCommand(context: vscode.ExtensionContext, ) {

        let disposable = vscode.commands.registerCommand(NOTEBOOK_TYPE + '.loadCurrentFolder',
            async (uri: vscode.Uri) => {
                return this.loadCurrentFolder(uri, context);
            });
        context.subscriptions.push(disposable);

        disposable = vscode.commands.registerCommand(NOTEBOOK_TYPE + '.processCurrentFolder',
            async (uri: vscode.Uri, kernelCommand? : string) => {
                const likelyViaUI = !kernelCommand || typeof(kernelCommand) !== 'string';
                if (likelyViaUI) {
                    kernelCommand = BoostConfiguration.currentKernelCommand;
                }
                return this.processCurrentFolder(uri, kernelCommand as string, context).catch((error) => {
                    boostLogging.error((error as Error).message, likelyViaUI);
                });
            });
        context.subscriptions.push(disposable);
    }

    registerFolderRightClickPdfCommands(context: vscode.ExtensionContext, ) {

        let disposable = vscode.commands.registerCommand(NOTEBOOK_TYPE + '.pdfCurrentFile',
            async (uri: vscode.Uri) => {
                await this.pdfFromCurrentFile(uri).then((pdfFile : string) => {
                    boostLogging.info(`PDF ${pdfFile} created for file:${uri.fsPath}.`, uri === undefined);
                }).catch((error : any) => {
                    boostLogging.error(`Unable to generate PDF for current file:${uri.fsPath} due to ${(error as Error).message}`, uri === undefined);
                });
            });
        context.subscriptions.push(disposable);

        disposable = vscode.commands.registerCommand(NOTEBOOK_TYPE + '.pdfCurrentFolder',
            async (uri: vscode.Uri) => {
                return this.pdfFromCurrentFolder(uri).catch((error : any) => {
                    boostLogging.error((error as Error).message, );
                });
            });
        context.subscriptions.push(disposable);
    }

    async loadCurrentFile(uri: vscode.Uri, context: vscode.ExtensionContext) {
        try
        {
            // if we don't have a file selected, then the user didn't right click
            //      so we need to find the current active editor, if its available
            if (uri === undefined) {
                if (vscode.window.activeTextEditor === undefined) {
                    boostLogging.warn("Unable to identify an active file to Boost.");
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
                currentNotebook = await createNotebookFromSourceFile(uri, false, true) as vscode.NotebookDocument;
                boostLogging.warn(
                    `No active Notebook found. Created default Notebook for: ${uri.toString()}`);
            } else {
                await parseFunctionsFromFile(uri, currentNotebook);
            }
            
            boostLogging.log(`Boosted file:[${uri.fsPath.toString()}`);
            vscode.window.showNotebookDocument(currentNotebook);
        } catch (error) {
            boostLogging.error(`Unable to Boost file:[${uri.fsPath.toString()} due to error:${error}`);
        }
    }

    async processCurrentFile(uri: vscode.Uri, kernelCommand : string, context: vscode.ExtensionContext) {
        try
        {
            // if we don't have a file selected, then the user didn't right click
            //      so we need to find the current active editor, if its available
            if (uri === undefined) {
                if (vscode.window.activeTextEditor === undefined) {
                    boostLogging.warn(`Unable to identify an active file to Process ${this.kernelCommand}`);
                    return;
                }
                else {
                    uri = vscode.window.activeTextEditor?.document.uri;
                }
            }

            const targetedKernel = this.getCurrentKernel(kernelCommand);
            if (targetedKernel === undefined) {
                return;
            }

            let boostUri = uri;
                // if we got a source file, then load the notebook from it
            if (!uri.fsPath.endsWith(NOTEBOOK_EXTENSION)) {
                boostUri = getBoostNotebookFile(uri);
            }

            const notebook = new boostnb.BoostNotebook();
            if (!fs.existsSync(boostUri.fsPath)) {
                throw new Error(`Unable to find Boost notebook for ${uri.fsPath} - please create Boost notebook first`);
            }

            notebook.load(boostUri.fsPath);
            return targetedKernel?.executeAllWithAuthorization(notebook.cells, notebook).then(() => {
                // ensure we save the notebook if we successfully processed it
                notebook.save(boostUri.fsPath);
            }).catch((error) => {
                boostLogging.warn(`Skipping Notebook save - due to Error Processing ${kernelCommand} on file:[${uri.fsPath.toString()} due to error:${error}`);
                throw error;
            });
        } catch (error) {
            throw new Error(`Unable to Process ${kernelCommand} on file:[${uri.fsPath.toString()} due to error:${error}`);
        }
    }

    private getCurrentKernel(requestedKernel? : string) : KernelControllerBase | undefined {
        if (!requestedKernel && !this.kernelCommand) {
            boostLogging.error(`No Boost Kernel Command selected`);
            return undefined;
        } else if (!requestedKernel) {
            requestedKernel = this.kernelCommand;
        }

        let targetedKernel : KernelControllerBase | undefined;
        this.kernels.forEach((kernel) => {
            if (kernel.id === requestedKernel) {
                targetedKernel = kernel;
            }
        });
        if (targetedKernel === undefined) {
            boostLogging.error(`Unable to find Kernel for ${requestedKernel}`);
            return undefined;
        }
        return targetedKernel;
    }

    async processCurrentFolder(uri: vscode.Uri, kernelCommand : string, context: vscode.ExtensionContext) {
        let targetFolder : vscode.Uri;
        // if we don't have a folder selected, then the user didn't right click
        //      so we need to use the workspace folder
        if (uri === undefined) {
            if (vscode.workspace.workspaceFolders === undefined) {
                boostLogging.warn(
                    'Unable to find Workspace Folder. Please open a Project or Folder first');
                return;
            }

            // use first folder in workspace
            targetFolder = vscode.workspace.workspaceFolders[0].uri;
            boostLogging.debug(`Analyzing Project Wide source file in Workspace: ${targetFolder.fsPath}`);
        }
        else {
            targetFolder = uri;
            boostLogging.debug(`Analyzing source files in folder: ${uri.fsPath}`);
        }

        let baseWorkspace;
        if (vscode.workspace.workspaceFolders) {
            baseWorkspace = vscode.workspace.workspaceFolders![0].uri;
        } else {
            baseWorkspace = uri;
        }
        // we're going to search for everything under our target folder, and let the notebook parsing code filter out what it can't handle
        let searchPattern = new vscode.RelativePattern(targetFolder.fsPath, '**/*.*');
        let ignorePattern = await _buildVSCodeIgnorePattern();
        boostLogging.debug("Skipping source files of pattern: " + ignorePattern??"none");
        let files = await vscode.workspace.findFiles(searchPattern, ignorePattern?new vscode.RelativePattern(targetFolder, ignorePattern):"");
            
        boostLogging.debug("Analyzing " + files.length + " files in folder: " + targetFolder);

        const targetedKernel = this.getCurrentKernel(kernelCommand);
        if (targetedKernel === undefined) {
            return;
        }
        
        try {
            let processedNotebookWaits : any [] = [];

            files.filter(async (file) => {
                processedNotebookWaits.push(this.processCurrentFile(file, targetedKernel.id, context));
            });
            
            await Promise.all(processedNotebookWaits)
                .then((processedNotebooks) => {
                    processedNotebooks.forEach(async (notebook : boostnb.BoostNotebook) => {
                        // we let user know the notebook was processed
                        boostLogging.info(`Boost Notebook processed with command ${targetedKernel.command}: ${notebook.uri.fsPath}`, false);
                    });
                    boostLogging.info(`${processedNotebookWaits.length.toString()} Boost Notebooks processed for folder ${targetFolder.path}`, false);
                })
                .catch((error) => {
                // Handle the error here
                    boostLogging.error(`Error Boosting folder ${targetFolder.path} due to Error: ${error}`);
                });
        } catch (error) {
            boostLogging.error(`Unable to Process ${kernelCommand} on Folder:[${uri.fsPath.toString()} due to error:${error}`);
        }
    }
    
    registerFileRightClickAnalyzeCommand(context: vscode.ExtensionContext, ) {
    
        let disposable = vscode.commands.registerCommand(NOTEBOOK_TYPE + '.loadCurrentFile',
            async (uri: vscode.Uri) => {
                return this.loadCurrentFile(uri, context);
            });
        context.subscriptions.push(disposable);

        disposable = vscode.commands.registerCommand(NOTEBOOK_TYPE + '.processCurrentFile',
            async (uri: vscode.Uri, kernelCommand? : string) => {
                const likelyViaUI = !kernelCommand || typeof(kernelCommand) !== 'string';
                if (likelyViaUI) {
                    kernelCommand = BoostConfiguration.currentKernelCommand;
                }
                return this.processCurrentFile(uri, kernelCommand as string, context).catch((error) => {
                    boostLogging.error((error as Error).message, likelyViaUI);
                });
            });
        context.subscriptions.push(disposable);
    }

    async pdfFromCurrentFile(uri: vscode.Uri) : Promise<string> {
        return new Promise<string>((resolve, reject) => {
            try
            {
                // if we don't have a file selected, then the user didn't right click
                //      so we need to find the current active editor, if its available
                if (uri === undefined) {
                    if (vscode.window.activeTextEditor === undefined) {
                        boostLogging.warn(`Unable to identify an active file to process ${this.kernelCommand}`);
                        reject(new Error('No active file found'));
                        return;
                    }
                    else {
                        uri = vscode.window.activeTextEditor?.document.uri;
                    }
                }

                let boostUri = uri;
                    // if we got a source file, then load the notebook from it
                if (!uri.fsPath.endsWith(NOTEBOOK_EXTENSION)) {
                    boostUri = getBoostNotebookFile(uri);
                }

                if (!fs.existsSync(boostUri.fsPath)) {
                    reject(new Error(`Unable to find Boost notebook for ${uri.fsPath} - please create Boost notebook first`));
                    return;
                }

                const baseWorkspacePath = vscode.workspace.workspaceFolders![0].uri.fsPath;
                const pdfFile = generatePDFforNotebook(boostUri.fsPath, baseWorkspacePath);
                resolve(pdfFile);
            } catch (error) {
                reject(error);
            }
        });
    }

    async pdfFromCurrentFolder(folderUri: vscode.Uri) {
        let targetFolder : vscode.Uri;
        // if we don't have a folder selected, then the user didn't right click
        //      so we need to use the workspace folder
        if (folderUri === undefined) {
            if (vscode.workspace.workspaceFolders === undefined) {
                boostLogging.warn(
                    'Unable to find Workspace Folder. Please open a Project or Folder first');
                return;
            }

            // use first folder in workspace
            targetFolder = vscode.workspace.workspaceFolders[0].uri;
            boostLogging.debug(`Analyzing Project Wide Boost files in Workspace: ${targetFolder.fsPath}`);
        }
        else {
            targetFolder = folderUri;
            boostLogging.debug(`Analyzing Boost files in folder: ${folderUri.fsPath}`);
        }

        let baseWorkspace;
        if (vscode.workspace.workspaceFolders) {
            baseWorkspace = vscode.workspace.workspaceFolders![0].uri;
        } else {
            baseWorkspace = folderUri;
        }
        // we're going to search for everything under our target folder, and let the notebook parsing code filter out what it can't handle
        let searchPattern = new vscode.RelativePattern(targetFolder.fsPath, '**/*' + NOTEBOOK_EXTENSION);
        let ignorePattern = await _buildVSCodeIgnorePattern();
        boostLogging.debug("Skipping Boost Notebook files of pattern: " + ignorePattern??"none");
        let files = await vscode.workspace.findFiles(searchPattern, ignorePattern?new vscode.RelativePattern(targetFolder, ignorePattern):"");
            
        boostLogging.debug("Converting " + files.length + " files in folder: " + targetFolder);
        
        try {
            let convertedNotebookWaits : any [] = [];

            files.filter(async (file) => {
                convertedNotebookWaits.push(this.pdfFromCurrentFile(file));
            });
            
            await Promise.all(convertedNotebookWaits)
                .then((convertedNotebooks) => {
                    convertedNotebooks.forEach(async (convertedPdf : string) => {
                        // we let user know the notebook was processed
                        boostLogging.info(`Boost Notebook converted ${convertedPdf}`, false);
                    });
                    boostLogging.info(`${convertedNotebookWaits.length.toString()} Boost Notebooks converted for folder ${targetFolder.path}`, false);
                })
                .catch((error) => {
                // Handle the error here
                    boostLogging.error(`Error convertting Notebooks in folder ${targetFolder.path} due to Error: ${error}`);
                });
        } catch (error) {
            boostLogging.error(`Unable to Convert Notebooks ub Folder:[${folderUri.fsPath.toString()} due to error:${error}`);
        }
    }
}

export function activate(context: vscode.ExtensionContext) {
    new BoostExtension(context);
}

// for completeness, we provide a deactivate function - asynchronous return
//    if we have resources to cleanup in the future
export async function deactivate(): Promise<void> {
    const outputChannel = vscode.window.createOutputChannel(NOTEBOOK_TYPE);

    outputChannel.appendLine('Deactivating Boost Notebook Extension');
  
    return undefined;
}

export function getBoostNotebookFile(sourceFile : vscode.Uri) : vscode.Uri {
    // if we don't have a workspace folder, just place the Boost file in a new Boostdir - next to the source file

    let baseFolder;
    if (!vscode.workspace.workspaceFolders) {
        baseFolder = path.dirname(sourceFile.fsPath);
    }
    else {
        const workspaceFolder = vscode.workspace.workspaceFolders[0]; // Get the first workspace folder
        baseFolder = workspaceFolder.uri.fsPath;
    }
    // create the .boost folder if we need to - this is statically located in the workspace folder no matter which child folder is processed
    const boostFolder = path.join(baseFolder, BoostConfiguration.defaultDir);
    fs.mkdirSync(boostFolder, { recursive: true });

    // get the distance from the workspace folder for the source file
    const relativePath = path.relative(baseFolder,sourceFile.fsPath);
    // create the .boost file path, from the new boost folder + amended relative source file path
    const absoluteBoostNotebookFile = path.join(boostFolder, relativePath + NOTEBOOK_EXTENSION);
    let boostNotebookFile = vscode.Uri.file(absoluteBoostNotebookFile);
    return boostNotebookFile;
}

async function createNotebookFromSourceFile(
    sourceFile : vscode.Uri,
    useBoostNotebookWithNoUI : boolean,
    overwriteIfExists : boolean = true,
    existingNotebook : vscode.NotebookDocument | boostnb.BoostNotebook | undefined = undefined) :
        Promise<vscode.NotebookDocument | boostnb.BoostNotebook> {

    const notebookPath = getBoostNotebookFile(sourceFile);
    const fileExists = fs.existsSync(notebookPath.fsPath);
    if (fileExists && !overwriteIfExists) {
        boostLogging.error(`Boost Notebook file already exists. Please delete the file and try again.\n  ${notebookPath.fsPath}`);
        return Promise.reject(`Boost Notebook file already exists. Please delete the file and try again.\n  ${notebookPath.fsPath}`);
    }

    boostLogging.debug(`Boosting file: ${sourceFile.fsPath} as ${notebookPath.fsPath}`);

    var newNotebook : vscode.NotebookDocument | boostnb.BoostNotebook;
    if (BoostConfiguration.processFoldersInASingleNotebook) {
        if (!existingNotebook) {
            if (useBoostNotebookWithNoUI) {
                newNotebook = new boostnb.BoostNotebook();
            } else {
                newNotebook = await vscode.workspace.openNotebookDocument(NOTEBOOK_TYPE, new vscode.NotebookData([]));
            }
        } else {
            newNotebook = existingNotebook;
        }
    } else {
        newNotebook = await createEmptyNotebook(notebookPath, useBoostNotebookWithNoUI);
    }

    // load/parse source file into new notebook
    await parseFunctionsFromFile(sourceFile, newNotebook, BoostConfiguration.processFoldersInASingleNotebook);

    if (!BoostConfiguration.processFoldersInASingleNotebook) {
        if (useBoostNotebookWithNoUI) {
            newNotebook.save(notebookPath.path);
        } else {
            // Save the notebook to disk
            const notebookData = await (new BoostContentSerializer()).serializeNotebookFromDoc(newNotebook as vscode.NotebookDocument);
            await vscode.workspace.fs.writeFile(notebookPath, notebookData);
        }
    } else if (useBoostNotebookWithNoUI) {
        newNotebook.save(notebookPath.path);
    }
    return newNotebook;
}

async function parseFunctionsFromFile(
    fileUri : vscode.Uri,
    targetNotebook : boostnb.BoostNotebook | vscode.NotebookDocument,
    appendToExistingNotebook : boolean = false) {

    const fileContents = fs.readFileSync(fileUri.path, 'utf8');
    
    // turn fileContents into a string and call splitCode
    const fileContentsString = fileContents.toString();
    const [languageId, splitCodeResult] = parseFunctions(
        fileUri.toString(),
        fileContentsString);

    //now loop through the splitCodeResult and create a cell for each item,
    //  adding to an array of cells
    const cells = [];

    for (let i = 0; i < splitCodeResult.length; i++) {
        const cell = (targetNotebook instanceof boostnb.BoostNotebook)?
            new boostnb.BoostNotebookCell(boostnb.NotebookCellKind.Code, splitCodeResult[i], languageId, i.toString()) :
            new vscode.NotebookCellData(vscode.NotebookCellKind.Code, splitCodeResult[i], languageId);
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
    if (!appendToExistingNotebook &&
        targetNotebook.isDirty &&
            // if there are multiple cells, or
        (targetNotebook.cellCount > 1 ||
            // unless there's only one cell and its the default Instructions (e.g. not code)
        targetNotebook.cellCount === 1 && targetNotebook.cellAt(0).kind !== boostnb.NotebookCellKind.Markup )) {
        const choice = await vscode.window.showInformationMessage(
            "The default Boost Notebook has unsaved data in it. If you proceed, that data will likely be lost. " +
            "Do you wish to proceed?", { "modal": true}, 'Yes', 'No');
        if (choice !== 'Yes') {
            return;
        }
    }

    // get the range of the cells in the notebook
    const range = (!(targetNotebook instanceof boostnb.BoostNotebook))?
        new vscode.NotebookRange(0, targetNotebook.cellCount):undefined;
    const edit = (!(targetNotebook instanceof boostnb.BoostNotebook))?new vscode.WorkspaceEdit():undefined;

    if (appendToExistingNotebook) {
        if (targetNotebook instanceof boostnb.BoostNotebook) {
            targetNotebook.appendCells(cells as boostnb.BoostNotebookCell[]);
        } else if (edit) {
            // Use .set to add one or more edits to the notebook
            edit.set(targetNotebook.uri, [
                // Create an edit that replaces all the cells in the notebook with new cells created from the file
                vscode.NotebookEdit.insertCells(targetNotebook.cellCount, cells as vscode.NotebookCellData[]),

                // Additional notebook edits...
            ]);
        } else {
            boostLogging.error('Unable to append to existing notebook - Type logic error');
        }
    } else {
        let newMetadata = {
            ...targetNotebook.metadata,
            sourceFile: fileUri.toString()};

        if (targetNotebook instanceof boostnb.BoostNotebook) {
            targetNotebook.replaceCells(cells as boostnb.BoostNotebookCell[]);
            targetNotebook.metadata = newMetadata;
        } else if (edit) {
            // Use .set to add one or more edits to the notebook
            edit.set(targetNotebook.uri, [
                // Create an edit that replaces all the cells in the notebook with new cells created from the file
                vscode.NotebookEdit.replaceCells(range as vscode.NotebookRange, cells as vscode.NotebookCellData[]),

                // Additional notebook edits...
            ]);

            // store the source file on the notebook metadata, so we can use it for problems or reverse mapping
            edit.set(targetNotebook.uri, [vscode.NotebookEdit.updateNotebookMetadata(newMetadata)]);
        } else {
            boostLogging.error('Unable to replace existing notebook - Type logic error');
        }
    }
    // only use workspace editor if we are using vscode notebook
    if (!(targetNotebook instanceof boostnb.BoostNotebook)) {
        await vscode.workspace.applyEdit(edit as vscode.WorkspaceEdit);
    }
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

async function _buildVSCodeIgnorePattern(): Promise<string | undefined> {
    let workspaceFolder : vscode.Uri | undefined = vscode.workspace.workspaceFolders?.[0]?.uri;
    // if no workspace root folder, bail
    if (!workspaceFolder) {
        return undefined;
    }

    // read the .vscodeignore file
    let vscignoreFile = vscode.Uri.joinPath(workspaceFolder, ".vscodeignore");
    let patterns = await _extractIgnorePatternsFromFile(vscignoreFile.fsPath);

    // add the contents of the .boostignore file
    let boostignoreFile = vscode.Uri.joinPath(workspaceFolder, ".boostignore");
    patterns = patterns.concat(await _extractIgnorePatternsFromFile(boostignoreFile.fsPath));

    // never include the .boost folder - since that's where we store our notebooks
    if (!patterns.find((pattern) => pattern === '**/.boost/**')) {
        patterns.push('**/.boost/**');
    }

    // never include the .boostignore file since that's where we store our ignore patterns
    if (!patterns.find((pattern) => pattern === '**/.boostignore')) {
        patterns.push('**/.boostignore');
    }
  
    // const exclude = '{**/node_modules/**,**/bower_components/**}';
    const excludePatterns = "{" + patterns.join(',') + "}";
    return excludePatterns;
}

async function _extractIgnorePatternsFromFile(ignoreFile : string) : Promise<string[]> {
    // if no ignore file, bail
    if (!fs.existsSync(ignoreFile)) {
        return [];
    }

    const data = await fs.promises.readFile(ignoreFile);
    const patterns = data.toString().split(/\r?\n/).filter((line) => {
      return line.trim() !== '' && !line.startsWith('#');
    });
    return patterns;
}

async function createEmptyNotebook(filename : vscode.Uri, useBoostNotebookWithNoUI : boolean) :
        Promise<vscode.NotebookDocument | boostnb.BoostNotebook> {

    // if no UI, then create BoostNotebook directly and return it
    if (useBoostNotebookWithNoUI) {
        const boostNb = new boostnb.BoostNotebook();
        boostNb.metadata = { defaultDir : BoostConfiguration.defaultDir};
        return boostNb;
    }

    // otherwise, create a VSC notebook document and return it
    const notebookData: vscode.NotebookData = {
        metadata: { defaultDir : BoostConfiguration.defaultDir},
        cells: []
    };
    const dummmyToken = new vscode.CancellationTokenSource().token;

    const notebookBlob = await (new BoostContentSerializer()).serializeNotebook(notebookData, dummmyToken);
    await vscode.workspace.fs.writeFile(filename, notebookBlob);

    const newNotebook = await vscode.workspace.openNotebookDocument(filename);

    return newNotebook;
}