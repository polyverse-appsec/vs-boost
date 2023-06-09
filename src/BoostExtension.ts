import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as boostnb from './jupyter_notebook';

import { BoostAnalyzeKernel } from './analyze_controller';
import { BoostTestgenKernel } from './testgen_controller';
import { BoostConvertKernel } from './convert_controller';
import { BoostComplianceKernel } from './compliance_controller';
import { BoostExplainKernel, explainOutputType } from './explain_controller';
import { BoostCodeGuidelinesKernel } from './codeguidelines_controller';
import { BoostArchitectureBlueprintKernel } from './blueprint_controller';
import { BoostCustomProcessKernel } from './custom_controller';
import { BoostFlowDiagramKernel } from './flowdiagram_controller';
import { SummarizeKernel, summarizeKernelName } from './summary_controller';

import { BoostSummaryViewProvider } from './summary_view';
import { BoostStartViewProvider } from './start_view';
import { BoostChatViewProvider } from './chat_view';
import { BoostTreeDataProvider } from './base_tree_view';

import {
    getBoostFile, BoostFileType, parseFunctionsFromFile,
    _buildVSCodeIgnorePattern, newErrorFromItemData, createOrOpenNotebookFromSourceFile,
    _syncProblemsInCell, createOrOpenSummaryNotebookFromSourceFile,
    BoostCommands
} from './extension';
import { BoostContentSerializer } from './serializer';
import { BoostConfiguration } from './boostConfiguration';
import { boostLogging } from './boostLogging';
import { KernelControllerBase } from './base_controller';
import { updateBoostStatusColors, registerCustomerPortalCommand, setupBoostStatus } from './portal';
import { generatePDFforNotebook } from './convert_pdf';
import { generateMarkdownforNotebook } from './convert_markdown';
import { BoostProjectData, BoostProcessingStatus, emptyProjectData } from './BoostProjectData';
import { BoostMarkdownViewProvider } from './markdown_view';

import instructions from './instructions.json';

export class BoostExtension {
    // for state, we keep it in a few places
    // 1. here, in the extension object.  this should really just be transient state like UI objects
    // 2. in the globalState object.  this is syncronized with the cloud, so stuff like the organization should be kept there
    // 3. in the extension configuration. this is more 'permanent' state. 
    public statusBar: vscode.StatusBarItem | undefined;
    kernels: Map<string, KernelControllerBase> = new Map<string, KernelControllerBase>();

    constructor(context: vscode.ExtensionContext) {

        // ensure logging is shutdown
        context.subscriptions.push(boostLogging);

        this._setupBoostProjectDataLifecycle(context);

        let problems = this._setupDiagnosticProblems(context);

        this.setupNotebookEnvironment(context, problems);

        this.registerCreateNotebookCommand(context, problems);

        this.registerRefreshProjectDataCommands(context);

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

        this.registerFolderRightClickMarkdownCommands(context);

        this.setupDashboard(context);

        boostLogging.log('Activated Boost Notebook Extension');
        boostLogging.info('Polyverse Boost is now active');

        this.refreshBoostProjectsData();
    }
    private _setupBoostProjectDataLifecycle(context: vscode.ExtensionContext) {
        let disposable = vscode.workspace.onDidChangeWorkspaceFolders(this.workspaceFoldersChanged);
        context.subscriptions.push(disposable);

        disposable = vscode.workspace.onDidChangeConfiguration(this.configurationChanged);
        context.subscriptions.push(disposable);

        // initialize once on startup... especially since single-folder projects will never fire the events
        this.refreshBoostProjectsData();
    }

    _boostProjectData = new Map<vscode.Uri, BoostProjectData>();
    // FUTURE: We aren't syncing with files being added or removed from the project, or changes in those files
    private workspaceFoldersChanged(changeEvent: vscode.WorkspaceFoldersChangeEvent) {
        this.refreshBoostProjectsData();
    }

    private configurationChanged(changeEvent: vscode.ConfigurationChangeEvent) {
        this.refreshBoostProjectsData();
    }

    async refreshBoostProjectsData() : Promise<void> {

        new Promise<void>((resolve, reject) => {
            try {
                // future improvement - use changeEvent.added and changeEvent.removed to add or remove folders rather than resyncing everything

                const folders = vscode.workspace.workspaceFolders;
                if (!folders || folders.length === 0) {
                    this._boostProjectData.clear();
                    return;
                }

                folders.forEach((workspaceFolder) => {
                    // if we already have it, then no need to do anything
                    // otherwise, we need to either load it, or create it
                    let boostProjectData = this._boostProjectData.get(workspaceFolder.uri);
                    let boostProjectUri = getBoostFile(workspaceFolder.uri, BoostFileType.status);

                    if (!boostProjectData) {

                        boostProjectData = new BoostProjectData();
                        if (!fs.existsSync(boostProjectUri.fsPath)) {
                            // we need to create the new boost project file
                            boostLogging.debug(`No boost project file found at ${boostProjectUri.fsPath} - creating new one`);

                            // create the boost project file
                            this.initializeFromWorkspaceFolder(boostProjectData, workspaceFolder.uri);
                            this._boostProjectData.set(workspaceFolder.uri, boostProjectData);
                            return boostProjectData;
                        } else {
                            const boostProjectData = new BoostProjectData();
                            boostProjectData.load(boostProjectUri.fsPath);
                            this._boostProjectData.set(workspaceFolder.uri, boostProjectData);
                            return boostProjectData;
                        }
                    }
                    this.refreshProjectData(boostProjectData, workspaceFolder.uri);
                    boostProjectData.save(boostProjectUri.fsPath);
                });

                // unload/release any boost project data for folders that are no longer in the workspace
                this._boostProjectData.forEach((_value: BoostProjectData, workspaceFolder: vscode.Uri) => {
                    if (!folders.filter((thisFolder) => {
                        return thisFolder.uri === workspaceFolder;
                    })) {
                        this._boostProjectData.delete(workspaceFolder);
                    }
                });
                resolve();
            } catch (error) {
                boostLogging.error(`Error refreshing Boost Project data: ${error}`);
                reject(error);
            }
        });
    }

    async refreshProjectData(boostProjectData: BoostProjectData, workspaceFolder: vscode.Uri) {
        const issues : string[] = [];
        try {
            if (!boostProjectData.summary.summaryUrl) {
                const summaryPath = getBoostFile(workspaceFolder, BoostFileType.summary).path;
                const relativeSummaryPath = path.relative(workspaceFolder.fsPath, summaryPath);
                boostProjectData.summary.summaryUrl = "./" + relativeSummaryPath;
            }
            if (!fs.existsSync(path.resolve(workspaceFolder.fsPath, boostProjectData.summary.summaryUrl))) {
                issues.push(`No summary file found at ${boostProjectData.summary.summaryUrl}`);
            }
            const counts = await this.getBoostFilesForFolder(workspaceFolder);
            boostProjectData.summary.filesToAnalyze = counts.total;
            boostProjectData.summary.filesAnalyzed = counts.exists;


        } catch (error) {
            boostLogging.debug(`Error refreshing Boost Project data for ${workspaceFolder.fsPath}: ${error}`);
            issues.push(`Error refreshing Boost Project data for ${workspaceFolder.fsPath}: ${error}`);
        } finally {
            // store the total number of issues no matter what happened
            boostProjectData.summary.issues = issues;
        }
    }

    async initializeFromWorkspaceFolder(boostProjectData: BoostProjectData, workspaceFolder: vscode.Uri) {
        Object.assign(boostProjectData, emptyProjectData);

        boostProjectData.summary.summaryUrl = getBoostFile(workspaceFolder, BoostFileType.summary).fsPath;
        const counts = await this.getBoostFilesForFolder(workspaceFolder);
        boostProjectData.summary.filesToAnalyze = counts.total;
        boostProjectData.summary.filesAnalyzed = counts.exists;

        boostProjectData.summary.issues = [ "No issues found" ];

        boostProjectData.save(getBoostFile(workspaceFolder, BoostFileType.status).fsPath);
    }

    public getBoostProjectData(): any {

        let workspaceFolder = vscode.workspace.workspaceFolders?.[0].uri;
        if (!workspaceFolder) {
            return emptyProjectData;
        }

        return this._boostProjectData.get(workspaceFolder);
    }

    async getBoostFilesForFolder(workspaceFolder: vscode.Uri): Promise<{ total: number; exists: number }> {
        let searchPattern = new vscode.RelativePattern(workspaceFolder.fsPath, '**/*.*');
        let ignorePattern = await _buildVSCodeIgnorePattern();
        boostLogging.debug("Skipping source files of pattern: " + (ignorePattern ?? "none"));
        const files = await vscode.workspace.findFiles(
            searchPattern,
            ignorePattern ? new vscode.RelativePattern(workspaceFolder, ignorePattern) : ""
        );
    
        let total = 0;
        let exists = 0;
        for (const file of files) {
            total++;
            const boostFileUri = getBoostFile(file);
            const fileExists = fs.existsSync(boostFileUri.fsPath);
            if (!fileExists) {
                exists++;
            }
        }
    
        return { total, exists };
    }
    

    _setupDiagnosticProblems(context: vscode.ExtensionContext): vscode.DiagnosticCollection {

        // create the Problems collection
        const problems = vscode.languages.createDiagnosticCollection(boostnb.NOTEBOOK_TYPE + '.problems');

        // whenever we open a boost notebook, we need to re-sync the problems (in case errors were persisted with it)
        vscode.workspace.onDidOpenNotebookDocument((event) => {
            if (event.notebookType !== boostnb.NOTEBOOK_TYPE) {
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
                            if (value !== output.metadata?.outputType ?? explainOutputType) {
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
            if (event.notebookType !== boostnb.NOTEBOOK_TYPE) {
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
                if (!cellChange.outputs) { continue; }

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

    kernelCommand: string | undefined = undefined;
    setupKernelCommandPicker(context: vscode.ExtensionContext) {
        context.subscriptions.push(vscode.commands.registerCommand(
            boostnb.NOTEBOOK_TYPE + '.selectKernelCommand', async () => {
                // Use the vscode.window.showQuickPick method to let the user select kernel
                let availableKernelItems: any[] = [];
                let defaultKernelChoice: string | undefined = undefined;
                this.kernels.forEach((kernel: KernelControllerBase) => {
                    availableKernelItems.push({
                        label: kernel.command,
                        description: "Polyverse Boost: " + kernel.kernelLabel,
                        details: kernel.description
                    });
                    if (kernel.id === BoostConfiguration.currentKernelCommand) {
                        defaultKernelChoice = kernel.command;
                    }
                });

                const kernelChoice = await vscode.window.showQuickPick(availableKernelItems, {
                    title: "Choose a Kernel to use for processing of all Boost Notebooks and Cells",
                    canPickMany: false,
                    placeHolder: BoostConfiguration.currentKernelCommand ?? 'Select Boost Kernel',
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

    kernelStatusBar: vscode.StatusBarItem | undefined = undefined;

    setupKernelStatus(context: vscode.ExtensionContext) {
        const kernelStatusBar = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left, 9);
        this.kernelStatusBar = kernelStatusBar;

        const kernelCommand = BoostConfiguration.currentKernelCommand;

        this.kernelStatusBar.text = "Select Boost Kernel";
        this.kernels.forEach((kernel: KernelControllerBase) => {
            if (kernel.id !== kernelCommand) {
                return;
            }
            if (this.kernelStatusBar) {
                this.kernelStatusBar.text = `Boost Command: ${kernel.command}`;
            }
        });
        // if we have a kernel command specified, but didn't match it, the kernel choice is invalid
        if (kernelCommand && kernelCommand !== "" &&
            this.kernelStatusBar.text === "Select Boost Kernel") {
            boostLogging.error(`Invalid Boost command: ${BoostConfiguration.currentKernelCommand} - set a valid Boost kernel name in User Settings or reset to default`);
        }

        this.kernelStatusBar.command = boostnb.NOTEBOOK_TYPE + ".selectKernelCommand";
        this.kernelStatusBar.show();
        context.subscriptions.push(this.kernelStatusBar);
    }

    private setupTestFrameworkPicker(context: vscode.ExtensionContext) {
        context.subscriptions.push(vscode.commands.registerCommand(
            boostnb.NOTEBOOK_TYPE + '.selectTestFramework', async () => {

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
            boostnb.NOTEBOOK_TYPE + '.selectOutputLanguage', async () => {
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
        let flowDiagramKernel = new BoostFlowDiagramKernel(context, updateBoostStatusColors.bind(this), this, collection);
        this.kernels.set(flowDiagramKernel.command, flowDiagramKernel);
        let summarizeKernel = new SummarizeKernel(context, updateBoostStatusColors.bind(this), this, collection, this.kernels);
        this.kernels.set(summarizeKernel.command, summarizeKernel);

        context.subscriptions.push(
            vscode.workspace.registerNotebookSerializer(
                boostnb.NOTEBOOK_TYPE, new BoostContentSerializer(), { transientOutputs: false }
            ),
            convertKernel,
            analyzeKernel,
            explainKernel,
            testgenKernel,
            complianceKernel,
            guidelinesKernel,
            blueprintKernel,
            flowDiagramKernel,
            summarizeKernel
        );

        // if in dev mode, register all dev only kernels
        if (BoostConfiguration.enableDevOnlyKernels) {
            let customProcessKernel = new BoostCustomProcessKernel(context, updateBoostStatusColors.bind(this), this, collection);
            this.kernels.set(customProcessKernel.command, customProcessKernel);
            context.subscriptions.push(customProcessKernel);
        }
    }

    setupDashboard(context: vscode.ExtensionContext) {
        const summary = new BoostSummaryViewProvider(context, this);
        const chat = new BoostChatViewProvider(context, this);
        const docview = new BoostStartViewProvider(context, this);

        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider(BoostSummaryViewProvider.viewType, summary));

        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider(BoostChatViewProvider.viewType, chat));

        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider(BoostStartViewProvider.viewType, docview));

         /*
        This is the old tree view code for if/when we go back to that view style

        // Create data providers for each tree
        const docDataProvider = new BoostTreeDataProvider(this, "docAnalysis");
        const securityDataProvider = new BoostTreeDataProvider(this, "securityAnalysis");
        const complianceDataProvider = new BoostTreeDataProvider(this, "complianceAnalysis");

        // Register each TreeDataProvider with vscode
        vscode.window.registerTreeDataProvider('polyverse-boost-doc-view', docDataProvider);
        vscode.window.registerTreeDataProvider('polyverse-boost-security-view', securityDataProvider);
        vscode.window.registerTreeDataProvider('polyverse-boost-compliance-view', complianceDataProvider);  
        */
       
        const docs = new BoostMarkdownViewProvider(context, this, "doc");
        const security = new BoostMarkdownViewProvider(context, this, "security");
        const compliance = new BoostMarkdownViewProvider(context, this, "compliance");
        const blueprint = new BoostMarkdownViewProvider(context, this, "blueprint");

        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider('polyverse-boost-doc-view', docs));
        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider('polyverse-boost-security-view', security));
        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider('polyverse-boost-compliance-view', compliance));
        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider('polyverse-boost-blueprint-view', blueprint));
    }

    registerCreateNotebookCommand(
        context: vscode.ExtensionContext,
        problems: vscode.DiagnosticCollection) {

        context.subscriptions.push(vscode.commands.registerCommand(
            boostnb.NOTEBOOK_TYPE + '.createJsonNotebook', async () => {

                // we prepopulate the notebook with the instructions (as markdown)
                const language = 'markdown';
                const defaultInstructionData = instructions.markdown;
                const cell = new vscode.NotebookCellData(vscode.NotebookCellKind.Markup,
                    defaultInstructionData, language);
                const data = new vscode.NotebookData([cell]);

                // get the defaults
                const settings = vscode.workspace.getConfiguration(boostnb.NOTEBOOK_TYPE);

                data.metadata = {
                    outputLanguage: settings.outputLanguage,
                    testFramework: settings.testFramework,
                    defaultDir: settings.defaultDir
                };

                const doc = await vscode.workspace.openNotebookDocument(boostnb.NOTEBOOK_TYPE, data);

                const editor = await vscode.window.showNotebookDocument(doc);
            }));
    }

    registerOpenCodeFile(context: vscode.ExtensionContext) {
        // Register a command to handle the button click
        context.subscriptions.push(vscode.commands.registerCommand(
            boostnb.NOTEBOOK_TYPE + '.loadCodeFile', async () => {

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
        let targetFolder: vscode.Uri;
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
        boostLogging.debug("Skipping source files of pattern: " + ignorePattern ?? "none");
        let files = await vscode.workspace.findFiles(searchPattern, ignorePattern ? new vscode.RelativePattern(targetFolder, ignorePattern) : "");

        boostLogging.debug("Analyzing " + files.length + " files in folder: " + targetFolder);
        try {
            if (BoostConfiguration.processFoldersInASingleNotebook) {
                // we're going to create a single notebook for all the files
                let newNotebook: vscode.NotebookDocument | undefined;
                for (const file of files) {
                    newNotebook = await createOrOpenNotebookFromSourceFile(file, false, true, newNotebook) as vscode.NotebookDocument;
                    await createOrOpenSummaryNotebookFromSourceFile(file);
                }
                // create the folder level rollup
                await createOrOpenSummaryNotebookFromSourceFile(targetFolder);

                if (newNotebook) {
                    // we let user know the new scratch notebook was created
                    boostLogging.warn("Scratch Notebook opened: " + newNotebook.uri.toString(), true);
                }
            } else {
                let newNotebookWaits: any[] = [];

                files.filter(async (file) => {
                    newNotebookWaits.push(createOrOpenNotebookFromSourceFile(file, true));
                    newNotebookWaits.push(createOrOpenSummaryNotebookFromSourceFile(file));
                });
                // create project level rollup
                newNotebookWaits.push(createOrOpenSummaryNotebookFromSourceFile(targetFolder));

                await Promise.all(newNotebookWaits)
                    .then((createdNotebooks) => {
                        // we are generally creating one new notebook during this process, but in case, we de-dupe it
                        const newNotebooks = createdNotebooks.filter((value, index, self) => {
                            return self.indexOf(value) === index;
                        });
                        newNotebooks.forEach(async (notebook: boostnb.BoostNotebook) => {
                            // we let user know the new scratch notebook was created
                            boostLogging.info("Boost Notebook reloaded: " + notebook.fsPath, false);
                        });
                        boostLogging.info(`${newNotebookWaits.length.toString()} Boost Notebooks reloaded for folder ${targetFolder.path}`, false);
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

    registerFolderRightClickAnalyzeCommand(context: vscode.ExtensionContext,) {

        let disposable = vscode.commands.registerCommand(boostnb.NOTEBOOK_TYPE + '.' + BoostCommands.loadCurrentFolder,
            async (uri: vscode.Uri) => {
                return this.loadCurrentFolder(uri, context);
            });
        context.subscriptions.push(disposable);

        disposable = vscode.commands.registerCommand(boostnb.NOTEBOOK_TYPE + '.' + BoostCommands.processCurrentFolder,
            async (uri: vscode.Uri, kernelCommand?: string, forceAnalysisRefresh: boolean = false) => {
                const likelyViaUI = !kernelCommand || typeof (kernelCommand) !== 'string';
                if (likelyViaUI) {
                    kernelCommand = BoostConfiguration.currentKernelCommand;
                }
                return this.processCurrentFolder(uri, kernelCommand as string, context, forceAnalysisRefresh).catch((error) => {
                    boostLogging.error((error as Error).message, likelyViaUI);
                });
            });
        context.subscriptions.push(disposable);
    }

    registerFolderRightClickPdfCommands(context: vscode.ExtensionContext,) {

        let disposable = vscode.commands.registerCommand(boostnb.NOTEBOOK_TYPE + '.' + BoostCommands.pdfCurrentFile,
            async (uri: vscode.Uri) => {
                await this.pdfFromCurrentFile(uri).then((pdfFile: string) => {
                    if (!uri) {
                        boostLogging.info(`PDF ${pdfFile} created`, uri === undefined);
                    } else {
                        boostLogging.info(`PDF ${pdfFile} created for file:${uri.fsPath}.`, uri === undefined);
                    }
                }).catch((error: any) => {
                    boostLogging.error(`Unable to generate PDF for current file${uri ? ":" + uri.fsPath : ""} due to ${(error as Error).message}`, uri === undefined);
                });
            });
        context.subscriptions.push(disposable);

        disposable = vscode.commands.registerCommand(boostnb.NOTEBOOK_TYPE + '.' + BoostCommands.pdfCurrentFolder,
            async (uri: vscode.Uri) => {
                return this.pdfFromCurrentFolder(uri).catch((error: any) => {
                    boostLogging.error((error as Error).message,);
                });
            });
        context.subscriptions.push(disposable);
    }

    registerRefreshProjectDataCommands(context: vscode.ExtensionContext,) {

        let disposable = vscode.commands.registerCommand(boostnb.NOTEBOOK_TYPE + '.' + BoostCommands.refreshProjectData,
            async () => {
                await this.refreshBoostProjectsData().then(() => {
                    boostLogging.info(`Refreshed Boost Project Data.`, false);
                }).catch((error: any) => {
                    boostLogging.error(`Unable to Refresh Project Data`, false);
                });
            });
        context.subscriptions.push(disposable);
    }

    registerFolderRightClickMarkdownCommands(context: vscode.ExtensionContext,) {

        let disposable = vscode.commands.registerCommand(boostnb.NOTEBOOK_TYPE + '.' + BoostCommands.markdownCurrentFile,
            async (uri: vscode.Uri) => {
                await this.markdownFromCurrentFile(uri).then((markdownFile: string) => {
                    if (!uri) {
                        boostLogging.info(`Markdown ${markdownFile} created`, uri === undefined);
                    } else {
                        boostLogging.info(`Markdown ${markdownFile} created for file:${uri.fsPath}.`, uri === undefined);
                    }
                }).catch((error: any) => {
                    boostLogging.error(`Unable to generate Markdown for current file${uri ? ":" + uri.fsPath : ""} due to ${(error as Error).message}`, uri === undefined);
                });
            });
        context.subscriptions.push(disposable);

        disposable = vscode.commands.registerCommand(boostnb.NOTEBOOK_TYPE + '.' + BoostCommands.markdownCurrentFolder,
            async (uri: vscode.Uri) => {
                return this.markdownFromCurrentFolder(uri).catch((error: any) => {
                    boostLogging.error((error as Error).message,);
                });
            });
        context.subscriptions.push(disposable);
    }

    async loadCurrentFile(uri: vscode.Uri, context: vscode.ExtensionContext): Promise<boolean> {
        return new Promise(async (resolve, reject) => {
            try {
                // if we don't have a file selected, then the user didn't right click
                //      so we need to find the current active editor, if its available
                if (uri === undefined) {
                    if (vscode.window.activeTextEditor === undefined) {
                        boostLogging.warn("Unable to identify an active file to Boost.");
                        resolve(false);
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
                            resolve(doc.notebookType === boostnb.NOTEBOOK_TYPE);
                            return;
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
                            resolve(false);
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
                    currentNotebook = await createOrOpenNotebookFromSourceFile(uri, false, true) as vscode.NotebookDocument;
                    await createOrOpenSummaryNotebookFromSourceFile(uri);
                    boostLogging.warn(
                        `No active Notebook found. Created default Notebook for: ${uri.toString()}`);
                } else {
                    await parseFunctionsFromFile(uri, currentNotebook);
                }

                boostLogging.log(`Boosted file:[${uri.fsPath.toString()}`);
                vscode.window.showNotebookDocument(currentNotebook);
            } catch (error) {
                boostLogging.error(`Unable to Boost file:[${uri.fsPath.toString()} due to error:${error}`);
                resolve(false);
                return;
            }
            resolve(true);
        });
    }

    async processCurrentFile(sourceUri: vscode.Uri, kernelCommand: string, context: vscode.ExtensionContext, forceAnalysisRefresh: boolean = false): Promise<{ notebook: boostnb.BoostNotebook | undefined, result: boolean }> {
        return new Promise(async (resolve) => {
            try {
                // if we don't have a file selected, then the user didn't right click
                // so we need to find the current active editor if it's available
                if (sourceUri === undefined) {
                    if (vscode.window.activeTextEditor === undefined) {
                        boostLogging.warn(`Unable to identify an active file to Process ${kernelCommand}`);
                        resolve({ notebook: undefined, result: false });
                        return;
                    } else {
                        sourceUri = vscode.window.activeTextEditor?.document.uri;
                    }
                }

                const targetedKernel = this.getCurrentKernel(kernelCommand);
                if (targetedKernel === undefined) {
                    boostLogging.warn(`Unable to match analysis kernel for ${kernelCommand}`);
                    resolve({ notebook: undefined, result: false });
                    return;
                }

                let notebookUri = sourceUri;
                // if we got a source file or folder, then load the notebook from it
                if (!sourceUri.fsPath.endsWith(boostnb.NOTEBOOK_EXTENSION)) {
                    if (targetedKernel.command === summarizeKernelName) {
                        notebookUri = getBoostFile(sourceUri, BoostFileType.notebook);
                     } else {
                        notebookUri = getBoostFile(sourceUri, BoostFileType.notebook);
                     }
                } // else we are using a notebook file, so just use it

                let notebook = new boostnb.BoostNotebook();
                if (!fs.existsSync(notebookUri.fsPath)) {

                    if (targetedKernel.command !== summarizeKernelName) {
                        // if we haven't yet loaded/parsed this file, then let's do it implicitly for the customer
                        await createOrOpenNotebookFromSourceFile(sourceUri, true);
                        await createOrOpenSummaryNotebookFromSourceFile(sourceUri);

                        notebook.load(notebookUri.fsPath);
                    } else {
                        // if we are summarizing, then we need to create the summary notebook
                        notebook = await createOrOpenSummaryNotebookFromSourceFile(sourceUri);
                    }
                } else {
                    notebook.load(notebookUri.fsPath);
                }
                targetedKernel.executeAllWithAuthorization(notebook.cells, notebook, forceAnalysisRefresh)
                    .then(() => {
                        if (targetedKernel.command === summarizeKernelName) {
                            const summaryNotebookUri = getBoostFile(sourceUri, BoostFileType.summary);
                            boostLogging.info(`Saved Updated Notebook for ${kernelCommand} in file:[${summaryNotebookUri.fsPath}]`, false);
                        } else {
                            // ensure we save the notebook if we successfully processed it
                            notebook.save(notebookUri.fsPath);
                            boostLogging.info(`Saved Updated Notebook for ${kernelCommand} in file:[${notebookUri.fsPath}]`, false);
                        }
                        resolve({ notebook, result: true });
                    })
                    .catch((error) => {
                        boostLogging.warn(`Skipping Notebook save - due to Error Processing ${kernelCommand} on file:[${sourceUri.fsPath}] due to error:${error}`);
                        resolve({ notebook: undefined, result: false });
                    });
            } catch (error) {
                resolve({ notebook: undefined, result: false });
            }
        });
    }

    private getCurrentKernel(requestedKernel?: string): KernelControllerBase | undefined {
        if (!requestedKernel && !this.kernelCommand) {
            boostLogging.error(`No Boost Kernel Command selected`);
            return undefined;
        } else if (!requestedKernel) {
            requestedKernel = this.kernelCommand;
        }

        let targetedKernel: KernelControllerBase | undefined;
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

    async processCurrentFolder(uri: vscode.Uri, kernelCommand: string, context: vscode.ExtensionContext, forceAnalysisRefresh: boolean = false) {
        let targetFolder: vscode.Uri;
        // if we don't have a folder selected, then the user didn't right click
        // so we need to use the workspace folder
        if (uri === undefined) {
            if (vscode.workspace.workspaceFolders === undefined) {
                boostLogging.warn('Unable to find Workspace Folder. Please open a Project or Folder first');
                return;
            }

            // use the first folder in the workspace
            targetFolder = vscode.workspace.workspaceFolders[0].uri;
            boostLogging.debug(`Analyzing Project Wide source file in Workspace: ${targetFolder.fsPath}`);
        } else {
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
        boostLogging.debug("Skipping source files of pattern: " + (ignorePattern ?? "none"));
        let files = await vscode.workspace.findFiles(searchPattern, ignorePattern ? new vscode.RelativePattern(targetFolder, ignorePattern) : "");

        boostLogging.debug("Analyzing " + files.length + " files in folder: " + targetFolder);

        const targetedKernel = this.getCurrentKernel(kernelCommand);
        if (targetedKernel === undefined) {
            return;
        }

        try {
            let processedNotebookWaits: Promise<{ notebook: boostnb.BoostNotebook | undefined, result: boolean }>[] = files.map(async (file) => {
                return this.processCurrentFile(file, targetedKernel.id, context, forceAnalysisRefresh);
            });

            await Promise.all(processedNotebookWaits)
                .then((processedNotebooks) => {
                    processedNotebooks.forEach(({ notebook, result }) => {
                        // we let the user know the notebook was processed
                        if (notebook) {
                            boostLogging.info(
                                `Boost Notebook processed with command ${targetedKernel.command}: ${notebook.fsPath}`,
                                false
                            );
                        }
                    });
                    boostLogging.info(
                        `${processedNotebookWaits.length.toString()} Boost Notebooks processed for folder ${targetFolder.path}`,
                        false
                    );
                })
                .catch((error) => {
                    // Handle the error here
                    boostLogging.error(`Error Boosting folder ${targetFolder.path} due to Error: ${error}`);
                });

            // if we are doing a summary operation, then we process the named folder only (for the project/folder-level summary)
            // this happens after we do rollup summaries for all other source files - to make our project-level use the latest rollup
            if (targetedKernel.command === summarizeKernelName) {
                boostLogging.debug(`Boost Project-level Summary starting with Project: ${targetFolder.fsPath}`);
                await this.processCurrentFile(targetFolder, targetedKernel.id, context, forceAnalysisRefresh);
                boostLogging.info(`Boost Project-level Summary completed with Project: ${targetFolder.fsPath}`, false);
            }
        } catch (error) {
            boostLogging.error(`Unable to Process ${kernelCommand} on Folder:[${uri.fsPath.toString()} due to error:${error}`);
        }
    }


    registerFileRightClickAnalyzeCommand(context: vscode.ExtensionContext,) {

        let disposable = vscode.commands.registerCommand(boostnb.NOTEBOOK_TYPE + '.loadCurrentFile',
            async (uri: vscode.Uri) => {
                const boostFile = getBoostFile(uri);
                // create the Boost file, if it doesn't exist
                if (!fs.existsSync(boostFile.fsPath)) {
                    if (!await this.loadCurrentFile(uri, context) || !fs.existsSync(boostFile.fsPath)) {
                        boostLogging.warn(`Unable to open Boost Notebook for file:[${uri.fsPath}]; check the Polyverse Boost Output channel for details`);
                        return;
                    }
                }
                const boostDoc = await vscode.workspace.openNotebookDocument(boostFile);
                vscode.window.showNotebookDocument(boostDoc);
    });
        context.subscriptions.push(disposable);

        disposable = vscode.commands.registerCommand(boostnb.NOTEBOOK_TYPE + '.processCurrentFile',
            async (uri: vscode.Uri, kernelCommand?: string, forceAnalysisRefresh: boolean = false) => {
                const likelyViaUI = !kernelCommand || typeof (kernelCommand) !== 'string';
                if (likelyViaUI) {
                    kernelCommand = BoostConfiguration.currentKernelCommand;
                }
                return this.processCurrentFile(uri, kernelCommand as string, context, forceAnalysisRefresh).catch((error) => {
                    boostLogging.error((error as Error).message, likelyViaUI);
                });
            });
        context.subscriptions.push(disposable);
    }

    async pdfFromCurrentFile(uri: vscode.Uri): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            try {
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
                if (!uri.fsPath.endsWith(boostnb.NOTEBOOK_EXTENSION)) {
                    boostUri = getBoostFile(uri);
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
        let targetFolder: vscode.Uri;
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
        let searchPattern = new vscode.RelativePattern(targetFolder.fsPath, '**/*' + boostnb.NOTEBOOK_EXTENSION);
        let ignorePattern = await _buildVSCodeIgnorePattern(false);
        boostLogging.debug("Skipping Boost Notebook files of pattern: " + ignorePattern ?? "none");
        let files = await vscode.workspace.findFiles(searchPattern, ignorePattern ? new vscode.RelativePattern(targetFolder, ignorePattern) : "");

        boostLogging.debug("Converting " + files.length + " files in folder: " + targetFolder);

        try {
            let convertedNotebookWaits: any[] = [];

            files.filter(async (file) => {
                convertedNotebookWaits.push(this.pdfFromCurrentFile(file));
            });

            await Promise.all(convertedNotebookWaits)
                .then((convertedNotebooks) => {
                    convertedNotebooks.forEach(async (convertedPdf: string) => {
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
            boostLogging.error(`Unable to Convert Notebooks in Folder:[${folderUri.fsPath.toString()} due to error:${error}`);
        }
    }

    async markdownFromCurrentFile(uri: vscode.Uri): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            try {
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
                if (!uri.fsPath.endsWith(boostnb.NOTEBOOK_EXTENSION)) {
                    boostUri = getBoostFile(uri);
                }

                if (!fs.existsSync(boostUri.fsPath)) {
                    reject(new Error(`Unable to find Boost notebook for ${uri.fsPath} - please create Boost notebook first`));
                    return;
                }

                const baseWorkspacePath = vscode.workspace.workspaceFolders![0].uri.fsPath;
                const pdfFile = generateMarkdownforNotebook(boostUri.fsPath, baseWorkspacePath);
                resolve(pdfFile);
            } catch (error) {
                reject(error);
            }
        });
    }

    async markdownFromCurrentFolder(folderUri: vscode.Uri) {
        let targetFolder: vscode.Uri;
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
        let searchPattern = new vscode.RelativePattern(targetFolder.fsPath, '**/*' + boostnb.NOTEBOOK_EXTENSION);
        let ignorePattern = await _buildVSCodeIgnorePattern(false);
        boostLogging.debug("Skipping Boost Notebook files of pattern: " + ignorePattern ?? "none");
        let files = await vscode.workspace.findFiles(searchPattern, ignorePattern ? new vscode.RelativePattern(targetFolder, ignorePattern) : "");

        boostLogging.debug("Converting " + files.length + " files in folder: " + targetFolder);

        try {
            let convertedNotebookWaits: any[] = [];

            files.filter(async (file) => {
                convertedNotebookWaits.push(this.markdownFromCurrentFile(file));
            });

            await Promise.all(convertedNotebookWaits)
                .then((convertedNotebooks) => {
                    convertedNotebooks.forEach(async (convertedPdf: string) => {
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
            boostLogging.error(`Unable to Convert Notebooks in Folder:[${folderUri.fsPath.toString()} due to error:${error}`);
        }
    }
}