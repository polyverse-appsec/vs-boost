import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as boostnb from './jupyter_notebook';

import { BoostAnalyzeKernel, analyzeOutputType, analyzeKernelName } from './analyze_controller';
import { BoostAnalyzeFunctionKernel, analyzeFunctionKernelName } from './analyze_function_controller';
import { BoostTestgenKernel, testgenKernelName } from './testgen_controller';
import { BoostConvertKernel, convertKernelName } from './convert_controller';
import { BoostComplianceKernel, complianceOutputType, complianceKernelName } from './compliance_controller';
import { BoostComplianceFunctionKernel, complianceFunctionKernelName } from './compliance_function_controller';
import { BoostExplainKernel, explainOutputType, explainKernelName } from './explain_controller';
import { BoostCodeGuidelinesKernel, codeGuidelinesKernelName } from './codeguidelines_controller';
import { BoostArchitectureBlueprintKernel, blueprintOutputType, blueprintKernelName } from './blueprint_controller';
import { BoostCustomProcessKernel, customProcessCellMarker } from './custom_controller';
import { BoostFlowDiagramKernel, flowDiagramKernelName } from './flowdiagram_controller';
import { SummarizeKernel, summarizeKernelName, summaryFailedPrefix, summaryOutputType } from './summary_controller';

import { BoostSummaryViewProvider } from './summary_view';
import { BoostStartViewProvider } from './start_view';
import { BoostChatViewProvider } from './chat_view';

import {
    getBoostFile, BoostFileType, parseFunctionsFromFile,
    _buildVSCodeIgnorePattern, newErrorFromItemData, createOrOpenNotebookFromSourceFile,
    _syncProblemsInCell, createOrOpenSummaryNotebookFromSourceFile,
    BoostCommands,
    findCellByKernel,
    cleanCellOutput,
    boostActivityBarId,
    BoostUserAnalysisType
} from './extension';

import { BoostContentSerializer } from './serializer';
import { BoostConfiguration } from './boostConfiguration';
import { boostLogging } from './boostLogging';
import { KernelControllerBase, errorMimeType} from './base_controller';
import { updateBoostStatusColors, registerCustomerPortalCommand, setupBoostStatus, preflightCheckForCustomerStatus } from './portal';
import { generatePDFforNotebook } from './convert_pdf';
import { generateMarkdownforNotebook } from './convert_markdown';
import { generateHTMLforNotebook } from './convert_html';
import { BoostProjectData, BoostProcessingStatus, emptyProjectData, SectionSummary } from './BoostProjectData';
import { BoostMarkdownViewProvider } from './markdown_view';

import instructions from './instructions.json';

export class BoostExtension {
    // for state, we keep it in a few places
    // 1. here, in the extension object.  this should really just be transient state like UI objects
    // 2. in the globalState object.  this is syncronized with the cloud, so stuff like the organization should be kept there
    // 3. in the extension configuration. this is more 'permanent' state. 
    public statusBar: vscode.StatusBarItem | undefined;
    kernels: Map<string, KernelControllerBase> = new Map<string, KernelControllerBase>();

    public summaryViewProvider: BoostSummaryViewProvider | undefined;

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

        this.registerFolderRightClickOutputCommands(context);

        this.registerSourceCodeRightClickCommands(context);

        this.registerShowGuidelinesCommand(context);

        this.setupDashboard(context);

        boostLogging.log('Activated Boost Notebook Extension');

        if (BoostConfiguration.logLevel === 'debug') {
            boostLogging.info('Polyverse Boost is now active');
        }
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
        if (this) {
            this.refreshBoostProjectsData();
        }
    }

    private configurationChanged(changeEvent: vscode.ConfigurationChangeEvent) {
        if (this) {
            this.refreshBoostProjectsData();
        }
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

                folders.forEach(async (workspaceFolder) => {
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
                            await this.initializeFromWorkspaceFolder(boostProjectData, workspaceFolder.uri);
                            this._boostProjectData.set(workspaceFolder.uri, boostProjectData);
                            return boostProjectData;
                        } else {
                            const boostProjectData = new BoostProjectData();
                            boostProjectData.load(boostProjectUri.fsPath);
                            if (!boostProjectData.summary.projectName) {
                                boostProjectData.summary.projectName = path.basename(workspaceFolder.uri.fsPath);
                                boostProjectData.flushToFS();
                            }
                            this._boostProjectData.set(workspaceFolder.uri, boostProjectData);
                            return boostProjectData;
                        }
                    }
                    await this.refreshProjectData(boostProjectData, workspaceFolder.uri);
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
            await this.getBoostFilesForFolder(workspaceFolder, boostProjectData, true);


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
        await this.getBoostFilesForFolder(workspaceFolder, boostProjectData);

        boostProjectData.summary.issues = [ "No issues found" ];
        boostProjectData.summary.projectName = path.basename(workspaceFolder.fsPath);

        boostProjectData.save(getBoostFile(workspaceFolder, BoostFileType.status).fsPath);
    }

    public getBoostProjectData(): any {

        let workspaceFolder = vscode.workspace.workspaceFolders?.[0].uri;
        if (!workspaceFolder) {
            return emptyProjectData;
        }

        return this._boostProjectData.get(workspaceFolder);
    }

    async getBoostFilesForFolder(
        workspaceFolder: vscode.Uri,
        boostProjectData: BoostProjectData,
        deepScan: boolean = false):
            Promise<void> {
        let searchPattern = new vscode.RelativePattern(workspaceFolder.fsPath, '**/*.*');
        let ignorePattern = await _buildVSCodeIgnorePattern();
        boostLogging.debug("Skipping source files of pattern: " + (ignorePattern ?? "none"));
        const files = await vscode.workspace.findFiles(
            searchPattern,
            ignorePattern ? new vscode.RelativePattern(workspaceFolder, ignorePattern) : ""
        );
    
        let total = 0;
        let exists = 0;

        const sectionMap = new Map<string, SectionSummary>();
        sectionMap.set(explainOutputType, {
            analysisType: explainOutputType,
            status: BoostProcessingStatus.notStarted,
            completed: 0,
            error: 0,
            total: 0,
        });
        sectionMap.set(blueprintOutputType, {
            analysisType: blueprintOutputType,
            status: BoostProcessingStatus.notStarted,
            completed: 0,
            error: 0,
            total: 0,
        });
        sectionMap.set(complianceOutputType, {
            analysisType: complianceOutputType,
            status: BoostProcessingStatus.notStarted,
            completed: 0,
            error: 0,
            total: 0,
        });
        sectionMap.set(analyzeOutputType, {
            analysisType: analyzeOutputType,
            status: BoostProcessingStatus.notStarted,
            completed: 0,
            error: 0,
            total: 0,
        });
        sectionMap.set(summaryOutputType, {
            analysisType: summaryOutputType,
            status: BoostProcessingStatus.notStarted,
            completed: 0,
            error: 0,
            total: 0,
        });
        boostProjectData.sectionSummary = Array.from(sectionMap.values());
        boostProjectData.analysis = [];

        const summarySection = sectionMap.get(summaryOutputType);
        if (!summarySection) {
            boostLogging.debug(`No section found for ${summaryOutputType}; this should not be possible unless analysis types are out of sync`);
            return;
        }

        for (const file of files) {
            total++;
            const boostFileUri = getBoostFile(file);
            const fileExists = fs.existsSync(boostFileUri.fsPath);

            // we bail early if the notebook file doesn't exist, even though the summary file may exist
            //    since we don't trust a summary file without its original source notebook file
            if (!fileExists) {
                [explainOutputType, blueprintOutputType, complianceOutputType, analyzeOutputType].forEach((outputType) => {
                    const thisSection = sectionMap.get(outputType);
                    if (!thisSection) {
                        boostLogging.debug(`No section found for ${outputType}; this should not be possible unless analysis types are out of sync`);
                        return;
                    }

                    // this isn't an accurate count, since it could be many cells missing (e.g. functions), but since we haven't processed
                    //    the cells or notebook at all, we'll just add one
                    thisSection.total += 1;
                });

                continue;
            }
            exists++;
            if (!deepScan) {
                continue;
            }
            const boostNotebook = new boostnb.BoostNotebook();
            boostNotebook.load(boostFileUri.fsPath);

            sectionMap.forEach((sectionSummary) => {
                if (sectionSummary.analysisType === summaryOutputType) {
                    return;
                }
                sectionSummary.total += boostNotebook.cells.length;
            });

            boostNotebook.cells.forEach((cell) => {
                cell.outputs.forEach((output) => {
                    output.items.forEach((outputItem) => {
                        const thisSection = sectionMap.get(output.metadata.outputType);
                        if (!thisSection) {
                            return;
                        }
                        if (outputItem.mime === errorMimeType) {
                            thisSection.error++;
                        } else if (outputItem.data) {
                            thisSection.completed++;
                        }
                    });
                });
            });

            summarySection.total += 1;

            // now collect the summary file data (across all source files)
            let summaryFile = getBoostFile(file, BoostFileType.summary);
            const summaryExists = fs.existsSync(summaryFile.fsPath);
            if (!summaryExists) {
                continue;
            }

            // we're going to look through each summary file, and if it has all sections completed, we'll add one for complete
            const summaryNotebook = new boostnb.BoostNotebook();
            summaryNotebook.load(summaryFile.fsPath);

            let summaryError = false;
            let summaryCompleted = false;
            // we're ignoring flowDiagram at all, as part of explain - since that's cherry on top for content
            [explainOutputType, blueprintOutputType, complianceOutputType, analyzeOutputType].forEach((outputType) => {
                const thisSummaryCell = findCellByKernel(summaryNotebook, outputType) as boostnb.BoostNotebookCell;
                // if the summary cell is missing, we can't be summary complete
                if (!thisSummaryCell || !thisSummaryCell.value) {
                    summaryCompleted = false;
                    return;
                }
                // if the summary cell is in error state, we can't be complete either, but we're in error state
                if (thisSummaryCell.value.startsWith(summaryFailedPrefix)) {
                    summaryError = true;
                    return;                    
                }
                // if cell exists and has a value, we'll say we're complete (regardless of value)
                if (!summaryError) {
                    summaryCompleted = true;
                }
            });
            if (summaryError) {
                summarySection.error++;
            } else if (summaryCompleted) {
                summarySection.completed++;
            }
        }

        // and one overall summary for the whole project/folder
        summarySection.total += 1;

        // now collect the summary file data (across all source files)
        // This whole section is essentially identical code to above, but we're copying it here for now
        //    since the above code operates on source files only - revisit in future for refactoring
        let summaryFile = getBoostFile(workspaceFolder, BoostFileType.summary);
        const summaryExists = fs.existsSync(summaryFile.fsPath);
        if (summaryExists) {

            // we're going to look the overall summary file, and if it has all sections completed, we'll add one for complete
            const summaryNotebook = new boostnb.BoostNotebook();
            summaryNotebook.load(summaryFile.fsPath);

            let summaryError = false;
            let summaryCompleted = false;
            // we're ignoring flowDiagram at all, as part of explain - since that's cherry on top for content
            [explainOutputType, blueprintOutputType, complianceOutputType, analyzeOutputType].forEach((outputType) => {
                const thisSummaryCell = findCellByKernel(summaryNotebook, outputType) as boostnb.BoostNotebookCell;
                // if the summary cell is missing, we can't be summary complete
                if (!thisSummaryCell || !thisSummaryCell.value) {
                    summaryCompleted = false;
                    return;
                }
                // if the summary cell is in error state, we can't be complete either, but we're in error state
                if (thisSummaryCell.value.startsWith(summaryFailedPrefix) ||
                    // we look for an extra Error prefix since the cell may have the Error object displauyed as a string
                    thisSummaryCell.value.startsWith(`Error: ${summaryFailedPrefix}`)) {
                    summaryError = true;
                    return;                    
                }
                // if cell exists and has a value, we'll say we're complete (regardless of value)
                if (!summaryError) {
                    summaryCompleted = true;
                }
            });
            if (summaryError) {
                summarySection.error++;
            } else if (summaryCompleted) {
                summarySection.completed++;
            }
        }
        
        sectionMap.forEach((sectionSummary) => {
            if (sectionSummary.total === sectionSummary.completed) {
                sectionSummary.status = BoostProcessingStatus.completed;
            } else if (sectionSummary.completed === 0) {
                sectionSummary.status = BoostProcessingStatus.notStarted;
            } else {
                sectionSummary.status = BoostProcessingStatus.incomplete;
            }
        });

        boostProjectData.summary.filesToAnalyze = total;
        boostProjectData.summary.filesAnalyzed = exists;
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

        context.subscriptions.push(
            vscode.workspace.registerNotebookSerializer(
                boostnb.NOTEBOOK_TYPE, new BoostContentSerializer(), { transientOutputs: false }
            ));
        let kernelTypes = [
                BoostConvertKernel,
                BoostExplainKernel,
                BoostAnalyzeKernel,
                BoostTestgenKernel,
                BoostComplianceKernel,
                BoostCodeGuidelinesKernel,
                BoostArchitectureBlueprintKernel,
                BoostFlowDiagramKernel,
                BoostCustomProcessKernel,
                SummarizeKernel,
                BoostAnalyzeFunctionKernel,
                BoostComplianceFunctionKernel
            ];
        // if in dev mode, register all dev only kernels
        if (BoostConfiguration.enableDevOnlyKernels) {
            // register the dev only kernels
            const devKernelTypes : any[ ]= [
                ];
            kernelTypes = kernelTypes.concat(devKernelTypes);
        }
        // constructor and save all kernels
        for (const kernelType of kernelTypes) {
            const kernel = new kernelType(context, updateBoostStatusColors.bind(this), this, collection, this.kernels);
            this.kernels.set(kernel.command, kernel);
            // ensure all kernels are registered as subscriptions for disposal on exit
            context.subscriptions.push(kernel);
        }

    }

    setupDashboard(context: vscode.ExtensionContext) {
        const summary = new BoostSummaryViewProvider(context, this);
        const chat = new BoostChatViewProvider(context, this);
        const docview = new BoostStartViewProvider(context, this);

        this.summaryViewProvider = summary;

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
                    boostLogging.error('Currently active editor is not a Boost Notebook.');
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

    registerFolderRightClickAnalyzeCommand(context: vscode.ExtensionContext) {

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

    registerFolderRightClickOutputCommands(context: vscode.ExtensionContext) {

        // register the command to build the current file
        let disposable = vscode.commands.registerCommand(boostnb.NOTEBOOK_TYPE + '.' + BoostCommands.buildCurrentFileOutput,
            async (uri: vscode.Uri) => {
                if (!uri) {
                    boostLogging.error(`Unable to generate analysis output for current file due to no file selected`, true);
                    return;
                }

                await this.buildCurrentFileOutput(uri, false, BoostConfiguration.defaultOutputFormat).then((outputFile: string) => {
                    boostLogging.info(`${outputFile} created`, uri === undefined);
                }).catch((error: any) => {
                    boostLogging.error(`Unable to generate output for current file${uri.fsPath} due to ${(error as Error).message}`, true);
                });
            });
        context.subscriptions.push(disposable);

        // register the command to show the current file
        disposable = vscode.commands.registerCommand(boostnb.NOTEBOOK_TYPE + '.' + BoostCommands.showCurrentFileAnalysisOutput,
        async (uri: vscode.Uri) => {
            if (!uri) {
                boostLogging.error(`Unable to generate analysis output for current file due to no file selected`, true);
                return;
            }
    
            await this.buildCurrentFileOutput(uri, false, BoostConfiguration.defaultOutputFormat).then((outputFile: string) => {
                boostLogging.info(`${outputFile} created for file:${uri.fsPath}.`, false);
    
                // show the file now
                switch (BoostConfiguration.defaultOutputFormat) {
                    case "markdown":
                        vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.parse(outputFile)).then((success) => {
                            boostLogging.info(`Markdown Preview opened for ${outputFile}`, true);
                        }, (reason) => {
                            boostLogging.error(`Unable to open Markdown Preview for ${outputFile} due to ${(reason as Error).message}`, true);
                        });
                        break;
                    case "pdf":
                    case "html":
                        vscode.env.openExternal(vscode.Uri.parse(outputFile)).then((success) => {
                            boostLogging.info(`${BoostConfiguration.defaultOutputFormat.toUpperCase()} Preview opened for ${outputFile}`, true);
                        }, (reason) => {
                            boostLogging.error(`Unable to open ${BoostConfiguration.defaultOutputFormat.toUpperCase()} Preview for ${outputFile} due to ${(reason as Error).message}`, true);
                        });
                        break;
                    default:
                        boostLogging.error(`Unable to open output for ${outputFile} due to unknown format ${BoostConfiguration.defaultOutputFormat}`, true);
                }
            }).catch((error: any) => {
                boostLogging.error(`Unable to generate and show output for current file ${uri.fsPath} due to ${(error as Error).message}`, true);
            });
        });
    
        context.subscriptions.push(disposable);

        // build analysis output files for all files in the current folder
        disposable = vscode.commands.registerCommand(boostnb.NOTEBOOK_TYPE + '.' + BoostCommands.buildCurrentFolderOutput,
            async (uri: vscode.Uri) => {
                return this.buildCurrentFolderOutput(uri, BoostConfiguration.defaultOutputFormat).catch((error: any) => {
                    boostLogging.error((error as Error).message);
                });
            });
        context.subscriptions.push(disposable);

        // register the command to build the current file summary
        disposable = vscode.commands.registerCommand(boostnb.NOTEBOOK_TYPE + '.' + BoostCommands.buildCurrentFileSummaryOutput,
            async (uri: vscode.Uri) => {
                if (!uri) {
                    boostLogging.error(`Unable to generate analysis summary output for current file due to no file selected`, true);
                    return;
                }

                await this.buildCurrentFileOutput(uri, true, BoostConfiguration.defaultOutputFormat).then((outputFile: string) => {
                    boostLogging.info(`${outputFile} created for file:${uri.fsPath}.`, uri === undefined);
                }).catch((error: any) => {
                    boostLogging.error(`Unable to generate output for current file${uri.fsPath} due to ${(error as Error).message}`, true);
                });
            });
        context.subscriptions.push(disposable);

        // register the command to show the current file as a summary
        disposable = vscode.commands.registerCommand(boostnb.NOTEBOOK_TYPE + '.' + BoostCommands.showCurrentFileAnalysisSummaryOutput,
            async (uri: vscode.Uri) => {
                if (!uri) {
                    boostLogging.error(`Unable to show analysis summary output for current file due to no file selected`, true);
                    return;
                }

                await this.buildCurrentFileOutput(uri, true, BoostConfiguration.defaultOutputFormat).then((outputFile: string) => {
                    boostLogging.info(`${outputFile} created for file:${uri.fsPath}.`, uri === undefined);

                    // show the file now
                    switch (BoostConfiguration.defaultOutputFormat) {
                        case "markdown":
                            vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.parse(outputFile)).then((success) => {
                                boostLogging.info(`Markdown Preview opened for ${outputFile}`, false);
                            }, (reason) => {
                                boostLogging.error(`Unable to open Markdown Preview for ${outputFile} due to ${(reason as Error).message}`, false);
                            });
                            break;
                        case "pdf":
                        case "html":
                            vscode.env.openExternal(vscode.Uri.parse(outputFile)).then((success) => {
                                boostLogging.info(`${BoostConfiguration.defaultOutputFormat.toUpperCase()} Preview opened for ${outputFile}`, true);
                            }, (reason) => {
                                boostLogging.error(`Unable to open ${BoostConfiguration.defaultOutputFormat.toUpperCase()} Preview for ${outputFile} due to ${(reason as Error).message}`, true);
                            });
                            break;
                        default:
                            boostLogging.error(`Unable to open output for ${outputFile} due to unknown format ${BoostConfiguration.defaultOutputFormat}`, true);
                    }
                }).catch((error: any) => {
                    boostLogging.error(`Unable to generate and show summary output for current file${uri.fsPath} due to ${(error as Error).message}`, true);
                });
            });
        context.subscriptions.push(disposable);

        // register the command to build the current folder summary
        disposable = vscode.commands.registerCommand(boostnb.NOTEBOOK_TYPE + '.' + BoostCommands.buildCurrentFolderSummaryOutput,
            async (uri: vscode.Uri) => {
                await this.buildCurrentFileOutput(uri, true, BoostConfiguration.defaultOutputFormat).then((outputFile: string) => {
                    if (!uri) {
                        boostLogging.info(`${outputFile} created`, uri === undefined);
                    } else {
                        boostLogging.info(`${outputFile} created for file:${uri.fsPath}.`, uri === undefined);
                    }
                }).catch((error: any) => {
                    boostLogging.error(`Unable to generate summary output for current folder${uri ? ":" + uri.fsPath : ""} due to ${(error as Error).message}`, uri === undefined);
                });
            });
        context.subscriptions.push(disposable);

        // register the command to show the current folder summary
        disposable = vscode.commands.registerCommand(boostnb.NOTEBOOK_TYPE + '.' + BoostCommands.showCurrentFolderAnalysisSummaryOutput,
            async (uri: vscode.Uri) => {
                await this.buildCurrentFileOutput(uri, true, BoostConfiguration.defaultOutputFormat).then((outputFile: string) => {
                    if (!uri) {
                        boostLogging.info(`${outputFile} created`, false);
                    } else {
                        boostLogging.info(`${outputFile} created for file:${uri.fsPath}.`, uri === undefined);
                    }

                    // show the file now
                    switch (BoostConfiguration.defaultOutputFormat) {
                        case "markdown":
                            vscode.commands.executeCommand('markdown.showPreview', vscode.Uri.parse(outputFile)).then((success) => {
                                boostLogging.info(`Markdown Preview opened for ${outputFile}`, false);
                            }, (reason) => {
                                boostLogging.error(`Unable to open Markdown Preview for ${outputFile} due to ${(reason as Error).message}`, true);
                            });
                            break;
                        case "pdf":
                        case "html":
                            vscode.env.openExternal(vscode.Uri.parse(outputFile)).then((success) => {
                                boostLogging.info(`${BoostConfiguration.defaultOutputFormat.toUpperCase()} Preview opened for ${outputFile}`, true);
                            }, (reason) => {
                                boostLogging.error(`Unable to open ${BoostConfiguration.defaultOutputFormat.toUpperCase()} Preview for ${outputFile} due to ${(reason as Error).message}`, true);
                            });
                            break;
                        default:
                            boostLogging.error(`Unable to open output for ${outputFile} due to unknown format ${BoostConfiguration.defaultOutputFormat}`, true);
                    }
                }).catch((error: any) => {
                    boostLogging.error(`Unable to generate and show summary output for current folder${uri ? ":" + uri.fsPath : ""} due to ${(error as Error).message}`, true);
                });
            });
        context.subscriptions.push(disposable);
    }

    registerRefreshProjectDataCommands(context: vscode.ExtensionContext) {

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

    registerSourceCodeRightClickCommands(context: vscode.ExtensionContext) {

        let disposable = vscode.commands.registerCommand(boostnb.NOTEBOOK_TYPE + '.' + BoostCommands.analyzeSourceCode,
            async () => {
                const editor = vscode.window.activeTextEditor;
        
                if (!editor) {
                    boostLogging.warn(`No active editor found to analyze source code.`, false);
                    return;
                }

                // get the user's selected text
                const selectedText = editor.document.getText(editor.selection);
                if (selectedText === undefined || selectedText === "") {
                    boostLogging.warn(`No text selected to analyze source code.`, false);
                    return;
                }

                const targetedKernel = this.getCurrentKernel(BoostConfiguration.currentKernelCommand);
                if (targetedKernel === undefined) {
                    boostLogging.warn(`Please select an Analysis command type via Boost Status Bar at bottom of screen`, true);
                    return;
                }
        
                // analyze the source code
                await this.analyzeSourceCode(selectedText).then((analysisResults : string) => {
                    boostLogging.info(analysisResults, true);
                }).catch((error: any) => {
                    boostLogging.error(`Unable to Analyze Selected Text with ${BoostConfiguration.currentKernelCommand} due to ${error as Error}`, true);
                });
            });
        context.subscriptions.push(disposable);
    }

    registerShowGuidelinesCommand(context: vscode.ExtensionContext) {
            
        let disposable = vscode.commands.registerCommand(boostnb.NOTEBOOK_TYPE + '.' + BoostCommands.showGuidelines,
            async (guidelineType) => {
                const globalProjectGuidelineFile = getBoostFile(undefined, BoostFileType.guidelines, false);
                let projectGuidelineFile;
                if (!guidelineType) {
                    projectGuidelineFile = globalProjectGuidelineFile;
                } else {
                    if (!(guidelineType in BoostUserAnalysisType)) {
                        guidelineType = this.getUserAnalysisType(guidelineType);
                    }
                    // this user guideline file
                    const userGuidelinesFile = globalProjectGuidelineFile.fsPath.replace(
                            boostnb.NOTEBOOK_GUIDELINES_PRE_EXTENSION,
                            `.${guidelineType}${boostnb.NOTEBOOK_GUIDELINES_PRE_EXTENSION}`);
                    projectGuidelineFile = vscode.Uri.file(userGuidelinesFile);
                }

                if (!fs.existsSync(projectGuidelineFile.fsPath)) {
                    boostLogging.info(`No guidelines found for project. Building ${projectGuidelineFile.fsPath}`, false);
                    this._buildGuidelineFile(projectGuidelineFile, guidelineType);
                }
                const guidelinesNotebook = await vscode.workspace.openNotebookDocument(projectGuidelineFile);
                vscode.window.showNotebookDocument(guidelinesNotebook);
        });
        context.subscriptions.push(disposable);
    }

    async analyzeSourceCode(selectedText : string) : Promise<string> {
        return new Promise(async (resolve, reject) => {

            try {
                if (selectedText === undefined || selectedText === "") {
                    reject(new Error("No text selected to analyze source code."));
                    return;
                }

                // use default selected kernel
                const targetedKernel = this.getCurrentKernel(BoostConfiguration.currentKernelCommand);
                if (targetedKernel === undefined) {
                    reject(new Error(`Unable to match analysis kernel to analyze source code.`));
                    return;
                }

                let notebook = new boostnb.BoostNotebook();
                notebook.addCell(new boostnb.BoostNotebookCell(boostnb.NotebookCellKind.Code, selectedText, "plaintext", undefined));
                const cellMetadata = {
                    model: "gpt-3.5-turbo",
                    temperature: 0.1,
                }; // fast-processing model
                notebook.cells[0].initializeMetadata(cellMetadata);

                vscode.commands.executeCommand(`workbench.view.extension.${boostActivityBarId}`);

                targetedKernel.executeAllWithAuthorization(notebook.cells, notebook)
                    .then(() => {
                        resolve(cleanCellOutput(notebook.cells[0].outputs[0].items[0].data));
                    })
                    .catch((error) => {
                        reject(error);
                    });
            } catch (error) {
                reject(error as Error);
            }
        });
    }

    async loadCurrentFile(sourceFileUri: vscode.Uri, context: vscode.ExtensionContext): Promise<boolean> {
        return new Promise(async (resolve, reject) => {
            try {
                // if we don't have a file selected, then the user didn't right click
                //      so we need to find the current active editor, if its available
                if (sourceFileUri === undefined) {
                    if (vscode.window.activeTextEditor === undefined) {
                        boostLogging.warn("Unable to identify an active file to Boost.");
                        resolve(false);
                    }
                    else {
                        sourceFileUri = vscode.window.activeTextEditor?.document.uri;

                        if (!fs.existsSync(sourceFileUri.fsPath)) {
                            boostLogging.warn(`Unable to find file ${sourceFileUri.fsPath} to Boost. It may not be saved to disk yet.`, false);
                        }
                    }
                }

                let currentNotebook = vscode.window.activeNotebookEditor?.notebook;
                if (currentNotebook && sourceFileUri && currentNotebook.uri.fsPath !== sourceFileUri.fsPath) {
                    // if the open notebook doesn't match, don't use it
                    currentNotebook = undefined;
                }

                // if there is no active notebook editor, we need to find it
                // Note this only happens when using right-click in explorer or a non-Notebook active editor
                if (currentNotebook === undefined && !sourceFileUri) {
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
                        // if we only have one notebook (that matches Uri), then just use that one
                        currentNotebook = boostNotebooks[0];
                    }
                }

                // if we still failed to find an available Notebook, then warn and give up
                if (currentNotebook === undefined) {
                    if (!sourceFileUri.fsPath.endsWith(boostnb.NOTEBOOK_SUMMARY_EXTENSION)) {
                        currentNotebook = await createOrOpenNotebookFromSourceFile(sourceFileUri, false, true) as vscode.NotebookDocument;
                        await createOrOpenSummaryNotebookFromSourceFile(sourceFileUri);
                    } else {
                        // look up summary for raw source file by stripping off notebook extension
                        const summaryBoostFile = vscode.Uri.parse(sourceFileUri.fsPath.replace(boostnb.NOTEBOOK_SUMMARY_EXTENSION, '').
                            replace("/" + BoostConfiguration.defaultDir,''));
                        await createOrOpenSummaryNotebookFromSourceFile(summaryBoostFile);
                        currentNotebook = await vscode.workspace.openNotebookDocument(sourceFileUri);
                    }
                    boostLogging.warn(
                        `No active Notebook found. Created default Notebook for: ${sourceFileUri.toString()}`);
                } else if (!sourceFileUri.fsPath.endsWith(boostnb.NOTEBOOK_EXTENSION)) {
                    await parseFunctionsFromFile(sourceFileUri, currentNotebook);
                }

                boostLogging.log(`Loaded Boost file:[${sourceFileUri.fsPath.toString()}`);
                vscode.window.showNotebookDocument(currentNotebook);
            } catch (error) {
                boostLogging.error(`Unable to load Boost file:[${sourceFileUri.fsPath.toString()} due to error:${error}`);
                resolve(false);
                return;
            }
            resolve(true);
        });
    }

    async processCurrentFile(
        sourceUri: vscode.Uri,
        kernelCommand: string,
        _: vscode.ExtensionContext,
        forceAnalysisRefresh: boolean = false):
            Promise<boostnb.BoostNotebook> {
        return new Promise(async (resolve, reject) => {
            try {
                let inMemorySourceFile = false; // the source file is in memory (either Notebook or raw source)

                // if we don't have a file selected, then the user didn't right click
                // so we need to find the current active editor if it's available
                if (sourceUri === undefined) {
                    if (vscode.window.activeTextEditor === undefined) {
                        boostLogging.warn(`Unable to identify an active file to Process ${kernelCommand}`);
                        reject(new Error(`Unable to identify an active file to Process ${kernelCommand}`));
                        return;
                    } else {
                        sourceUri = vscode.window.activeTextEditor?.document.uri;
                        if (!fs.existsSync(sourceUri.fsPath)) {
                            inMemorySourceFile = true;
                            boostLogging.error(`Canceling in-memory source file processing ${sourceUri.toString()}`, false);
                            reject(new Error(`Please save ${sourceUri.toString()} before processing`));
                            return;
                        } else if (vscode.window.activeTextEditor?.document.isDirty) {
                            boostLogging.warn(`File ${sourceUri.toString() } has unsaved changes.`, true);
                        }
                    }
                }

                const targetedKernel = this.getCurrentKernel(kernelCommand);
                if (targetedKernel === undefined) {
                    boostLogging.warn(`Unable to match analysis kernel for ${kernelCommand}`);
                    reject(new Error(`Unable to match analysis kernel for ${kernelCommand}`));
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
                        resolve(notebook);
                    })
                    .catch((error) => {
                        boostLogging.warn(`Skipping Notebook save - due to Error Processing ${kernelCommand} on file:[${sourceUri.fsPath}] due to error:${error}`);
                        reject(error);
                    });
            } catch (error) {
                reject(error as Error);
            }
        });
    }

    public getUserAnalysisType(kernelName : string) : string {
        switch (kernelName) {
            case analyzeKernelName:
            case analyzeFunctionKernelName:
                return BoostUserAnalysisType.security;
            case complianceKernelName:
            case complianceFunctionKernelName:
                return BoostUserAnalysisType.compliance;
            case flowDiagramKernelName:
            case explainKernelName:
                return BoostUserAnalysisType.documentation;
            case blueprintKernelName:
            case summarizeKernelName:
            case codeGuidelinesKernelName:
            case convertKernelName:
            case testgenKernelName:
            case customProcessCellMarker:
                return BoostUserAnalysisType.blueprint;
        default:
            return kernelName;
        }
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

    private calculateEstimatedWords(fileSize: number): number {
        // Custom logic to estimate the number of words based on file size
        // Adjust this calculation based on the characteristics of your files
        const averageWordsPerByte = 0.05; // Example value
        return Math.floor(fileSize * averageWordsPerByte);
    }
    
    private calculateProcessingTime(estimatedWords: number, wordsPerFile: number): number {
        const oneMinute = 60 * 1000;
        const processingMinutes = estimatedWords / wordsPerFile;
        const processingMilliseconds = processingMinutes * oneMinute;
        return processingMilliseconds;
    }
    
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
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
            await preflightCheckForCustomerStatus(context, this);
        } catch (error) {
            const folderName = path.basename(targetFolder.fsPath);
            boostLogging.error(`Unable to process folder ${folderName} due to error: ${error}`);
            return;
        }
        try {
            // estimated processing about 160 pages of code per minute
            // Using the same calculation as before, at a rate of 40,000 words per minute (666.67 words per second) and
            //  assuming an average of 250 words per page:
            //      Pages processed = (Words processed / Words per page) = (666.67 words per second * 60 seconds) / 250 words per page
            //      Pages processed = 160 pages
            
            const throttleRateTokensPerMinute = 40000; // Approximated as words per minute
            const totalFiles = files.length;
            const wordsPerFile = throttleRateTokensPerMinute / totalFiles;
            const seconds = 1000;

            let processedNotebookWaits: Promise<boostnb.BoostNotebook>[] = files.map(async (file) => {
                return new Promise<boostnb.BoostNotebook>((resolve, reject) => {
                    const fileSize = fs.statSync(file.fsPath).size;
                    const estimatedWords = this.calculateEstimatedWords(fileSize);
                    const processingTime = this.calculateProcessingTime(estimatedWords, wordsPerFile);
            
                    boostLogging.log(`Delaying file ${file.fsPath} with ${estimatedWords} ~items to wait ${processingTime / seconds} secs`);
                    this.summaryViewProvider?.addQueue(targetedKernel.outputType, [file.fsPath], processingTime);
                    setTimeout(async () => {
                        // if its been more than 5 seconds, log it - that's about 13 pages of source in 5 seconds (wild estimate)
                        if (processingTime > 5 * seconds) {
                            boostLogging.log(`Starting processing file ${file.fsPath} with ${estimatedWords} ~items after waiting ${processingTime * seconds} secs`);
                        }
            
                        this.summaryViewProvider?.addJobs(targetedKernel.outputType, [file.fsPath], 1);
            
                        this.processCurrentFile(file, targetedKernel.id, context, forceAnalysisRefresh).then((notebook) => {

                            // get the distance from the workspace folder for the source file
                                    // for project-level status files, we ignore the relative path
                            let relativePath = path.relative(targetFolder.fsPath,file.fsPath);

                            this.summaryViewProvider?.finishJobs(targetedKernel.outputType, [relativePath], null, 1);
                            resolve(notebook);
                        }).catch((error) => {
                            // get the distance from the workspace folder for the source file
                            // for project-level status files, we ignore the relative path
                            let relativePath = path.relative(targetFolder.fsPath,file.fsPath);

                            this.summaryViewProvider?.finishJobs(targetedKernel.outputType, [relativePath], error, 1);
                            reject(error);
                        });
                    }, processingTime);
                });
            });

            await Promise.all(processedNotebookWaits)
                .then((processedNotebooks) => {
                    processedNotebooks.forEach((notebook) => {
                        // we let the user know the notebook was processed
                        boostLogging.info(
                            `Boost Notebook processed with command ${targetedKernel.command}: ${notebook.fsPath}`,
                            false
                        );
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

    registerFileRightClickAnalyzeCommand(context: vscode.ExtensionContext) {

        let disposable = vscode.commands.registerCommand(boostnb.NOTEBOOK_TYPE + '.' + BoostCommands.loadCurrentFile,
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

        disposable = vscode.commands.registerCommand(boostnb.NOTEBOOK_TYPE + '.' + BoostCommands.processCurrentFile,
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

        disposable = vscode.commands.registerCommand(boostnb.NOTEBOOK_TYPE + '.' + BoostCommands.loadSummaryFile,
            async (uri: vscode.Uri) => {
                const boostFile = getBoostFile(uri, BoostFileType.summary);
                // create the Boost file, if it doesn't exist
                if (!fs.existsSync(boostFile.fsPath)) {
                    if (!await this.loadCurrentFile(boostFile, context) || !fs.existsSync(boostFile.fsPath)) {
                        boostLogging.warn(`Unable to open Boost Summary Notebook for file:[${uri.fsPath}]; check the Polyverse Boost Output channel for details`);
                        return;
                    }
                }
                const boostDoc = await vscode.workspace.openNotebookDocument(boostFile);
                vscode.window.showNotebookDocument(boostDoc);
            });
        context.subscriptions.push(disposable);
    }

    async buildCurrentFileOutput(uri: vscode.Uri, summary : boolean, outputFormat : string): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            try {
                // if we don't have a file selected, and asking for single file analysis, then fail
                //  we only report summaries for folders
                if (uri === undefined) {
                    if (!summary) {
                        boostLogging.warn(`Unable to identify an active file to process ${this.kernelCommand}`);
                        reject(new Error('No active file found'));
                        return;
                    } else if (!vscode.workspace.workspaceFolders) {
                        boostLogging.error(`Cannot build summary without a Workspace or Project loaded`);
                        reject(new Error('Cannot build summary without a Workspace or Project loaded'));
                        return;
                    }

                    uri = vscode.workspace.workspaceFolders[0].uri;
                }

                let boostUri = uri;
                // if we got a source file, then load the notebook from it
                if (!uri.fsPath.endsWith(boostnb.NOTEBOOK_EXTENSION)) {
                    if (summary) {
                        boostUri = getBoostFile(uri, BoostFileType.summary);
                    } else {
                        boostUri = getBoostFile(uri);
                    }
                }

                if (!fs.existsSync(boostUri.fsPath)) {
                    reject(new Error(`Unable to find Boost notebook for ${uri.fsPath} - please create Boost notebook first`));
                    return;
                }

                const baseWorkspacePath = vscode.workspace.workspaceFolders![0].uri.fsPath;

                // if user didn't specify output format, then we'll use configuration
                if (!outputFormat) {
                    outputFormat = BoostConfiguration.defaultOutputFormat;
                }
                switch (outputFormat.toLowerCase()) {
                    case 'html':
                        generateHTMLforNotebook(boostUri.fsPath, baseWorkspacePath).then((htmlFile) => {
                            resolve(htmlFile);
                        }).catch((error) => {
                            reject(error);
                        });
                        break;
                    case 'pdf':
                        generatePDFforNotebook(boostUri.fsPath, baseWorkspacePath).then((pdfFile) => {
                            resolve(pdfFile);
                        }).catch((error) => {
                            reject(error);
                        });
                        break;
                    case 'markdown':
                        generateMarkdownforNotebook(boostUri.fsPath, baseWorkspacePath).then((markdownFile) => {
                            resolve(markdownFile);
                        }).catch((error) => {
                            reject(error);
                        });
                        break;
                    default:
                        reject(new Error(`Unsupported output format ${outputFormat} - please use html, pdf, or markdown`));
                }
            } catch (error) {
                reject(error);
            }
        });
    }

    async buildCurrentFolderOutput(folderUri: vscode.Uri, outputFormat : string) {
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
                convertedNotebookWaits.push(this.buildCurrentFileOutput(file, false, outputFormat));
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

    public sampleGuidelineRegEx = /^# Enter Your (\w+)?\1?"Project" Guidelines Here$/;

    private _buildGuidelineFile(projectGuidelineFile: vscode.Uri, guidelineType: any) {
    
        const sampleGuideline = `# Enter Your ${guidelineType?guidelineType:"Project"} Guidelines Here`;
    
        const sampleGuidelineCell = new boostnb.BoostNotebookCell(boostnb.NotebookCellKind.Markup, "", "markdown");
        const notebookMetadata : any = {"id": sampleGuidelineCell.id};
        notebookMetadata["guidelineType"] = guidelineType?guidelineType:"Project";
        sampleGuidelineCell.initializeMetadata(notebookMetadata);
        sampleGuidelineCell.value = sampleGuideline;
        const newGuidelineNotebook = new boostnb.BoostNotebook();
        newGuidelineNotebook.addCell(sampleGuidelineCell);
    
        newGuidelineNotebook.save(projectGuidelineFile.fsPath);
    }
}
