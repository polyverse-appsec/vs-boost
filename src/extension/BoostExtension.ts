import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as _ from "lodash";

// Boost specific imports
import * as boostnb from "../data/jupyter_notebook";
import * as analysis from "../data/IAnalysisContextData";

import { errorToString } from "../utilities/error";
import { BoostAuthenticationException } from "../utilities/BoostException";

import { ControllerOutputType } from "../controllers/controllerOutputTypes";

import { boostNotebookToFileSummaryItem } from "../data/BoostProjectData";
import {
    getCustomerStatus
} from "../controllers/customerPortal";

import {
    updateBoostIgnoreForTarget,
    getBoostIgnoreFile,
    getAllProjectFiles,
    removeOldBoostFiles,
    createDefaultBoostIgnoreFile,
} from "../utilities/files";

import {
    setUserOrganization,
    promptUserForOrganization
} from "../user/organization";

import {
    refreshBoostOrgStatus,
    boostStatusCommand
} from "./portal";

import {
    addToBoostOnly,
    removeFromBoostOnly,
    addToBoostInclude,
} from "../utilities/boostOnly";

import {
    getOrCreateGuideline,
    getBoostFile,
    BoostFileType,
    parseFunctionsFromFile,
    newErrorFromItemData,
    createOrOpenNotebookFromSourceFile,
    createOrOpenSummaryNotebookFromSourceFile,
    BoostCommands,
    findCellByKernel,
    boostActivityBarId,
    ProcessCurrentFolderOptions,
} from "./extension";
import { cleanCellOutput, getKernelName, totalElements } from "./extensionUtilities";
import { pendingBoostStatusBarText } from "./portal";
import { fullPathFromSourceFile } from "../utilities/files";
import {
    generateSingleLineSummaryForAnalysisData,
    getAnalysisForSourceTarget,
    setGlobalContextData,
} from "./vscodeUtilities";
import { BoostUserAnalysisType } from "../data/userAnalysisType";

import { BoostContentSerializer } from "../utilities/serializer";
import { BoostConfiguration } from "./boostConfiguration";
import { boostLogging } from "../utilities/boostLogging";

import {
    updateBoostStatusColors,
} from "./portal";
import { generatePDFforNotebook } from "../utilities/convert_pdf";
import { generateMarkdownforNotebook } from "../utilities/convert_markdown";
import { generateHTMLforNotebook } from "../utilities/convert_html";
import { BoostProjectData } from "../data/BoostProjectData";
import { IncompatibleVersionException } from "../data/incompatibleVersionException";
import { FileSummaryItem, emptyProjectData } from "../data/boostprojectdata_interface";

// UI imports
import { BoostMarkdownViewProvider } from "../dashboard/markdown_view";
import { BoostSummaryViewProvider, summaryViewType } from "../dashboard/summary_view";
import { BoostStartViewProvider } from "../dashboard/start_view";
import { BoostChatViewProvider } from "../dashboard/chat_view";

import instructions from "../instructions.json";

// Controller imports
import {
    KernelControllerBase,
    errorMimeType,
    boostUriSchema,
} from "../controllers/base_controller";

import {
    BoostPerformanceFunctionKernel,
    performanceFunctionKernelName,
} from "../controllers/performance_function_controller";
import {
    BoostPerformanceKernel,
    performanceKernelName,
} from "../controllers/performance_controller";

import {
    BoostAnalyzeKernel,
    analyzeKernelName,
} from "../controllers/analyze_controller";
import {
    BoostAnalyzeFunctionKernel,
    analyzeFunctionKernelName,
} from "../controllers/analyze_function_controller";
import {
    BoostTestgenKernel,
    testgenKernelName,
} from "../controllers/testgen_controller";
import {
    BoostConvertKernel,
    convertKernelName,
} from "../controllers/convert_controller";
import {
    BoostComplianceKernel,
    complianceKernelName,
} from "../controllers/compliance_controller";
import {
    BoostComplianceFunctionKernel,
    complianceFunctionKernelName,
} from "../controllers/compliance_function_controller";
import {
    BoostExplainKernel,
    explainKernelName,
} from "../controllers/explain_controller";
import {
    BoostCodeGuidelinesKernel,
    codeGuidelinesKernelName,
} from "../controllers/codeguidelines_controller";
import {
    BoostArchitectureBlueprintKernel,
    blueprintKernelName,
} from "../controllers/blueprint_controller";
import {
    BoostCustomProcessKernel,
    customProcessKernelName,
} from "../controllers/custom_controller";
import {
    BoostFlowDiagramKernel,
    flowDiagramKernelName,
} from "../controllers/flowdiagram_controller";
import {
    SummarizeKernel,
    summarizeKernelName,
} from "../controllers/summary_controller";
import {
    BoostQuickBlueprintKernel,
    quickBlueprintKernelName,
} from "../controllers/quick_blueprint_controller";
import { BugFunctionKernelControllerBase } from "../controllers/bug_function_base_controller";
import {
    BoostQuickComplianceSummaryKernel,
    quickComplianceSummaryKernelName,
} from "../controllers/quick_compliance_summary_controller";
import {
    BoostQuickSecuritySummaryKernel,
    quickSecuritySummaryKernelName,
} from "../controllers/quick_security_summary_controller";
import {
    BoostQuickPerformanceSummaryKernel,
    quickPerformanceSummaryKernelName,
} from "../controllers/quick_performance_summary_controller";
import { BoostCustomQuickScanFunctionKernel } from "../controllers/customquickscan_function_controller";
import {
    BoostChatKernel,
    chatKernelName,
} from "../controllers/chat_controller";
import {
    BoostConvertFunctionKernel,
    convertFunctionKernelName,
} from "../controllers/convert_function_controller";

import { InlineBoostAnnotations } from "../inline/inline";
import { ProjectContextData } from "../data/ProjectContextData";
import { ChatData } from "../data/ChatData";

import { addBoostToProjectExtensions } from "../extension/vscodeUtilities";

import { WorkflowEngine, WorkflowError } from "../utilities/workflow_engine";
import { BoostTestGenerateFunctionKernel } from "../controllers/testgen_function_controller";

interface ProcessRingsOptions {
    analysisTypes?: string[];
    fileLimit?: number;
    showUI?: boolean;
};

export class BoostNotebookContentProvider
    implements vscode.TextDocumentContentProvider
{
    // emitter and its event
    private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
    public readonly onDidChange = this._onDidChange.event;

    public async provideTextDocumentContent(
        uri: vscode.Uri,
        token: vscode.CancellationToken
    ): Promise<string> {
        if (uri.scheme !== boostUriSchema) {
            return "";
        }
        // strip off everything but path so we can load notebook file
        uri = vscode.Uri.file(uri.path);
        const boostDoc = await vscode.workspace.openNotebookDocument(uri);
        await vscode.window.showNotebookDocument(boostDoc);

        return "";
    }

    public update(uri: vscode.Uri) {
        this._onDidChange.fire(uri);
    }
}

export class BoostExtension {
    // for state, we keep it in a few places
    // 1. here, in the extension object.  this should really just be transient state like UI objects
    // 2. in the globalState object.  this is syncronized with the cloud, so stuff like the organization should be kept there
    // 3. in the extension configuration. this is more 'permanent' state.
    public statusBar: vscode.StatusBarItem | undefined;
    kernels: Map<string, KernelControllerBase> = new Map<
        string,
        KernelControllerBase
    >();

    public readonly sampleGuidelineRegEx =
        /^# Enter Your \w+ Guidelines Here\n\nYou can describe your goals, constraints, or hints for analysis$/;

    public blueprint: BoostMarkdownViewProvider | undefined;
    public docs: BoostMarkdownViewProvider | undefined;
    public compliance: BoostMarkdownViewProvider | undefined;
    public security: BoostMarkdownViewProvider | undefined;
    public performance: BoostMarkdownViewProvider | undefined;
    public start: BoostStartViewProvider | undefined;
    public chat: BoostChatViewProvider | undefined;
    public summary: BoostSummaryViewProvider | undefined;
    private _accountInfo: any | undefined;

    public _context: vscode.ExtensionContext | undefined;
    public inlineAnnotations: InlineBoostAnnotations | undefined;

    problems: vscode.DiagnosticCollection;

    successfullyActivated = false;
    finishedActivation = false;

    constructor(context: vscode.ExtensionContext) {
        // ensure logging is shutdown
        context.subscriptions.push(boostLogging);
        this._context = context;

        // report DevMode for feature changes
        if (BoostConfiguration.enableDevOnlyKernels) {
            boostLogging.info(
                "Boost Dev Mode enabled - activating pre-release and development features",
                true
            );
        } else {
            boostLogging.debug(
                "Boost Dev Mode disabled - ONLY stable features will be enabled",
            );
        }

        this._setupBoostProjectDataLifecycle(context);

        this.problems = this._setupDiagnosticProblems(context);

        // make sure the UI starts up - so user isn't seeing broken UI
        this.setupDashboard(context);

        try {
            this.setupNotebookEnvironment(context, this.problems);

            this._setupNotebookChangedLifecycle(context);

            this.registerCreateNotebookCommand(context, this.problems);

            this.registerProjectCommands(context);

            this.registerCustomerPortalCommand(context);

            this.setupBoostStatus(context);

            // register the select language command
            this.setupKernelCommandPicker(context);

            // only show status-bar based kernel picker in dev mode
            if (BoostConfiguration.enableDevOnlyKernels) {
                setGlobalContextData("devMode", true);

                this.setupKernelStatus(context);
            }

            // register the select language command
            this.setupOutputLanguagePicker(context);

            // register the select framework command
            this.setupTestFrameworkPicker(context);

            this.registerUriHandler(context);

            this.registerOpenCodeFile(context);

            this.registerProjectLevelCommands(context);

            this.registerFileExplorerRightClickAnalysisSelectionCommands(
                context
            );

            this.registerFileRightClickAnalyzeCommand(context);

            this.registerFolderRightClickAnalyzeCommand(context);

            this.registerFileExplorerRightClickOutputCommands(context);

            this.registerSourceCodeRightClickCommands(context);

            this.registerShowGuidelinesCommand(context);

            this.inlineAnnotations = new InlineBoostAnnotations(context, this);

            this.successfullyActivated = true;
        } catch (e) {
            this.successfullyActivated = false;
            const error = e as Error;
            boostLogging.error(
                `Extension Activation failed due to critical error ${errorToString(
                    error
                )}`,
                false
            );
        } finally {
            if (this.successfullyActivated) {
                boostLogging.log("Activated Boost Notebook Extension");
            } else {
                // the caller will provide a popup error UI anyway
                boostLogging.error(
                    "Boost Notebook Extension Activation failed - some features are unavailable",
                    false
                );
            }

            // initialize once on startup...
            // don't wait for it to finish, since we want UI to come up asap
            this.refreshBoostProjectsData().then(() => {
                this.finishedActivation = true;

                boostLogging.info(
                    "Polyverse Boost is now active",
                    BoostConfiguration.logLevel === "debug"
                );

                this.blueprint?.refresh();
                this.docs?.refresh();
                this.compliance?.refresh();
                this.security?.refresh();
                this.performance?.refresh();
                this.summary?.refresh();
                this.chat?.refresh();
                this.start?.refresh();
            });
        }
    }

    registerUriHandler(context: vscode.ExtensionContext) {
        let provider = new BoostNotebookContentProvider();
        const disposable = vscode.workspace.registerTextDocumentContentProvider(
            boostUriSchema,
            provider
        );
        context.subscriptions.push(disposable);
    }

    private _setupBoostProjectDataLifecycle(context: vscode.ExtensionContext) {
        let disposable = vscode.workspace.onDidChangeWorkspaceFolders(
            async (e: vscode.WorkspaceFoldersChangeEvent) => {
                if (!this) {
                    // in case we fire during extension startup constructor
                    return;
                }
                await this.slowConfigurationChanged;
            }
        );
        context.subscriptions.push(disposable);

        disposable = vscode.workspace.onDidChangeConfiguration(
            async (e: vscode.ConfigurationChangeEvent) => {
                if (!this) {
                    // in case we fire during extension startup constructor
                    return;
                }
                await this.configurationChanged();
            }
        );
        context.subscriptions.push(disposable);
    }

    slowConfigurationChanged = _.debounce(this.refreshBoostProjectsData, 5000, { leading: true });

    async configurationChanged() {
        boostLogging.debug("Configuration changed");
        // debounce configuration changes so we don't refresh too often
        this.slowConfigurationChanged();
    }

    private _setupNotebookChangedLifecycle(context: vscode.ExtensionContext) {
        let disposable = vscode.workspace.onDidChangeNotebookDocument(
            (event: vscode.NotebookDocumentChangeEvent) => {
                if (!this) {
                    // in case we fire during extension startup constructor
                    return;
                }

                // if there are no cells left in the notebook, then clear all Problems
                if (event.notebook.getCells().length === 0) {
                    this.kernels.forEach((kernel: KernelControllerBase) => {
                        if (!(kernel instanceof BugFunctionKernelControllerBase)) {
                            return;
                        }

                        kernel.sourceLevelIssueCollection.delete(
                            event.notebook.uri
                        );
                    });

                    // if no content changes we care about, exit
                } else if (
                    !event.contentChanges ||
                    event.contentChanges.length === 0
                ) {
                    return;
                }

                // we're only going to reset diagnostic problems when cells are deleted/removed
                const removedCells = event.contentChanges.filter(
                    (
                        value: vscode.NotebookDocumentContentChange,
                        index: number,
                        array: readonly vscode.NotebookDocumentContentChange[]
                    ) => {
                        return (
                            value.removedCells && value.removedCells.length > 0
                        );
                    }
                );
                if (removedCells && removedCells.length > 0) {
                    this.loadAllSourceLevelErrorsFromNotebook(
                        event.notebook,
                        true
                    );
                }
            }
        );
        context.subscriptions.push(disposable);
    }

    _boostProjectData = new Map<vscode.Uri, BoostProjectData>();

    public updateAccountInfo(accountInfo: any) {
        this._accountInfo = accountInfo;
        const boostdata: BoostProjectData | undefined =
            this.getBoostProjectData();
        if (boostdata) {
            boostdata.updateAccountStatusFromService(accountInfo);

            // make sure we write the updated account info to disk
            boostdata.flushToFS();

            // and if we have boostdata, go ahead and refresh the dashboard
            this.summary?.refresh();
        }
    }
    async refreshBoostProjectsData(): Promise<void> {
        boostLogging.debug("refreshBoostProjectsData");
        return new Promise<void>(async (resolve, reject) => {
            try {
                // future improvement - use changeEvent.added and changeEvent.removed to add or remove folders rather than resyncing everything

                const folders = vscode.workspace.workspaceFolders;
                if (!folders || folders.length === 0) {
                    this._boostProjectData.clear();
                    resolve();
                    return;
                }

                for (const workspaceFolder of folders) {
                    await this.refreshProjectDataCacheForWorkspaceFolder(
                        workspaceFolder
                    );
                }

                // unload/release any boost project data for folders that are no longer in the workspace
                this._boostProjectData.forEach(
                    (_value: BoostProjectData, workspaceFolder: vscode.Uri) => {
                        if (
                            !folders.filter((thisFolder) => {
                                return thisFolder.uri === workspaceFolder;
                            })
                        ) {
                            this._boostProjectData.delete(workspaceFolder);
                        }
                    }
                );
                resolve();
            } catch (error) {
                boostLogging.error(
                    `Error refreshing Boost Project data: ${errorToString(error)}`
                );
                reject(error);
            }
        });
    }

    async refreshProjectDataCacheForWorkspaceFolder(
        workspaceFolder: vscode.WorkspaceFolder
    ) {
        // Check if boost project data already exists
        let boostProjectData = this._boostProjectData.get(workspaceFolder.uri);
        let boostProjectUri = getBoostFile(workspaceFolder.uri, {
            format: BoostFileType.status,
        });

        // if we have an existing data cache then remember that we're refreshing
        const firstCacheLoad = boostProjectData === undefined;

        if (boostProjectData) {
            // Refresh project data and save boost project data
            await this.refreshProjectData(
                boostProjectData,
                workspaceFolder.uri
            );
            boostProjectData.save(boostProjectUri.fsPath);
        }

        // Create new boost project data if it doesn't exist
        boostProjectData = new BoostProjectData();

        if (!fs.existsSync(boostProjectUri.fsPath)) {
            // Create new boost project file
            boostLogging.debug(
                `No boost project file found at ${boostProjectUri.fsPath} - creating new one`
            );
            await this.initializeFromWorkspaceFolder(
                boostProjectData,
                workspaceFolder.uri
            );
        } else {
            try {
                // Load existing boost project data
                boostProjectData.load(boostProjectUri.fsPath);
            } catch (error) {
                if (error instanceof IncompatibleVersionException) {
                    // Create new boost project file if incompatible version is found
                    boostLogging.info(
                        `Older version ${error.actualVersion} of Boost Project Data Cache found ${boostProjectUri.fsPath} - creating cache at version ${error.expectedVersion}`
                    );
                    boostProjectData = undefined;
                } else if (error instanceof SyntaxError) {
                    // Create new boost project file if JSON is malformed
                    boostLogging.info(
                        `Existing Boost Project Data Cache corrupted at ${boostProjectUri.fsPath} - creating new cache`
                    );
                    boostProjectData = undefined;
                } else {
                    throw error;
                }
            } finally {
                // Recreate boost project data from scratch if failed to load
                if (!boostProjectData) {
                    boostProjectData = new BoostProjectData();
                    fs.renameSync(
                        boostProjectUri.fsPath,
                        boostProjectUri.fsPath + ".previous"
                    );
                    await this.initializeFromWorkspaceFolder(
                        boostProjectData,
                        workspaceFolder.uri
                    );
                }
                // if this is the first time we're loading this project cache,
                //      then reset it to idle
                if (firstCacheLoad) {
                    boostProjectData.finishBatchJob();
                }
            }

            // refresh it on load to make sure we are up to date with any offline changes
            await this.refreshProjectData(
                boostProjectData,
                workspaceFolder.uri
            );

            let needsFlush = false;
            // refresh the boost configuration for this project
            if (boostProjectData.settings.fileLimit !== BoostConfiguration.projectFileCountLimit) {
                boostProjectData.settings.fileLimit = BoostConfiguration.projectFileCountLimit;
                needsFlush = true;
            }

            // Set project name in boost project data if not already set
            if (!boostProjectData.summary.projectName) {
                boostProjectData.summary.projectName = path.basename(
                    workspaceFolder.uri.fsPath
                );
                needsFlush = true;
            }

            if (needsFlush) {
                boostProjectData.flushToFS();
            }
        }

        // Update boost project data map with new boost project data
        this._boostProjectData.set(workspaceFolder.uri, boostProjectData);
        return boostProjectData;
    }

    async refreshProjectData(
        boostProjectData: BoostProjectData,
        workspaceFolder: vscode.Uri
    ) {
        const issues: string[] = [];
        try {
            if (!boostProjectData.summary.summaryUrl) {
                const summaryPath = getBoostFile(workspaceFolder, {
                    format: BoostFileType.summary,
                }).fsPath;
                const relativeSummaryPath = path.relative(
                    workspaceFolder.fsPath,
                    summaryPath
                );
                boostProjectData.summary.summaryUrl =
                    "../" + relativeSummaryPath;
            } else {
                if (path.isAbsolute(boostProjectData.summary.summaryUrl)) {
                    boostProjectData.summary.summaryUrl = path.relative(
                        workspaceFolder.fsPath,
                        boostProjectData.summary.summaryUrl
                    );
                }
            }
            if (
                !fs.existsSync(
                    path.resolve(
                        workspaceFolder.fsPath,
                        boostProjectData.summary.summaryUrl
                    )
                )
            ) {
                issues.push(
                    `No summary file found at ${boostProjectData.summary.summaryUrl}`
                );
            }
            const boostNotebooks = await this.getBoostFilesForFolder(
                workspaceFolder,
                boostProjectData,
                true
            );
            boostNotebooks.forEach((notebook) => {
                this.loadAllAnalysisErrorsFromNotebook(
                    notebook,
                    this.problems as vscode.DiagnosticCollection
                );
                this.loadAllSourceLevelErrorsFromNotebook(notebook);
            });
        } catch (error) {
            boostLogging.debug(
                `Error refreshing Boost Project data for ${workspaceFolder.fsPath}: ${errorToString(error)}`
            );
            issues.push(
                `Error refreshing Boost Project data for ${workspaceFolder.fsPath}: ${errorToString(error)}`
            );
        } finally {
            // store the total number of issues no matter what happened
            boostProjectData.summary.issues = issues;
        }
    }

    async initializeFromWorkspaceFolder(
        boostProjectData: BoostProjectData,
        workspaceFolder: vscode.Uri
    ) {
        Object.assign(boostProjectData, emptyProjectData);
        boostProjectData.dataFormatVersion = BoostConfiguration.version;

        boostProjectData.summary.summaryUrl = path.relative(
            workspaceFolder.fsPath,
            getBoostFile(workspaceFolder, { format: BoostFileType.summary })
                .fsPath
        );
        await this.getBoostFilesForFolder(
            workspaceFolder,
            boostProjectData,
            true
        );

        boostProjectData.summary.issues = ["No issues found"];
        boostProjectData.summary.projectName = path.basename(
            workspaceFolder.fsPath
        );

        boostProjectData.save(
            getBoostFile(workspaceFolder, { format: BoostFileType.status })
                .fsPath
        );
    }

    public getBoostProjectData(): BoostProjectData | undefined {
        let workspaceFolder = vscode.workspace.workspaceFolders?.[0].uri;
        if (!workspaceFolder) {
            return new BoostProjectData();
        }

        return this._boostProjectData.get(workspaceFolder);
    }

    async getBoostFilesForFolder(
        workspaceFolder: vscode.Uri,
        boostProjectData: BoostProjectData,
        deepScan: boolean = false
    ): Promise<boostnb.BoostNotebook[]> {
        const setOfAllFiles : Set<string> = new Set<string>();
        const files = (await getAllProjectFiles( { targetFolder: workspaceFolder, enforceFileLimit: false })).map(
            (file) => {
                return vscode.Uri.file(file);
            }
        );

        let total = 0;
        let exists = 0;

        let previousSectionSummary;
        if (deepScan) {
            // reset the section summary - so we can rebuild it
            previousSectionSummary = boostProjectData.sectionSummary;
            boostProjectData.sectionSummary = JSON.parse(JSON.stringify(emptyProjectData.sectionSummary));
        }

        const boostNotebooks: boostnb.BoostNotebook[] = [];
        for (const file of files) {
            total++;
            const boostFileUri = getBoostFile(file);
            const fileExists = fs.existsSync(boostFileUri.fsPath);

            // now add it to boostprojectdata
            let relativePath = path.relative(
                workspaceFolder.fsPath,
                file.fsPath
            );

            setOfAllFiles.add(relativePath);

            if (fileExists) {
                exists++;
            }

            if (!deepScan) {
                continue;
            }

            if (fileExists) {
                const boostNotebook = new boostnb.BoostNotebook();
                boostNotebook.load(boostFileUri.fsPath);
                boostNotebooks.push(boostNotebook);

                // get the summary of the notebook file
                const filesummary = boostNotebookToFileSummaryItem(
                    workspaceFolder.fsPath,
                    boostNotebook
                );
                // reset the project data for the file to baseline (from notebooks)
                boostProjectData.updateWithFileSummary(filesummary, relativePath, true);
            } else {
                const nonExistentFileSummary : FileSummaryItem = {
                        sourceRelFile: relativePath,
                        notebookRelFile: vscode.workspace.asRelativePath(boostFileUri),
                        totalCells: 0,
                        completedCells: 0,
                        errorCells: 0,
                        issueCells: 0,
                        sections: {},
                    };
                
                // reset the project data for the file to baseline (from notebooks)
                boostProjectData.updateWithFileSummary(nonExistentFileSummary, relativePath, true);
            }
        }

        // cleanup stale or deleted/ignored files from project cache
        for (const fileName of Object.keys(boostProjectData.files)) {
            if (!setOfAllFiles.has(fileName)) {
                delete boostProjectData.files[fileName];
            }
        }

        if (deepScan && JSON.stringify(previousSectionSummary) !== JSON.stringify(boostProjectData.sectionSummary)) {
            boostLogging.warn(`Project Analysis Info for Overall Project has changed after reset.`);
        }

        boostProjectData.summary.filesToAnalyze = total;
        boostProjectData.summary.filesAnalyzed = exists;
        return boostNotebooks;
    }

    isFileInWorkspace(uri: vscode.Uri): boolean {
        const workspaceFolders = vscode.workspace.workspaceFolders;

        if (!workspaceFolders) {
            return false;
        }

        const uriPath = uri.fsPath;
        for (const folder of workspaceFolders) {
            const folderPath = folder.uri.fsPath;
            if (uriPath.startsWith(folderPath)) {
                return true;
            }
        }

        return false;
    }

    async loadAllSourceLevelErrorsFromNotebook(
        notebook: vscode.NotebookDocument | boostnb.BoostNotebook,
        deleteExisting: boolean = false
    ) {
        const usingBoostNotebook = notebook instanceof boostnb.BoostNotebook;

        // we walk all kernels to
        for (const value of this.kernels.values()) {
            if (!(value instanceof BugFunctionKernelControllerBase)) {
                continue;
            }
            const cells = usingBoostNotebook
                ? notebook.cells
                : notebook.getCells();
            if (deleteExisting) {
                value.sourceLevelIssueCollection.delete(
                    vscode.Uri.file(notebook.metadata.sourceFile as string)
                );
            } else {
                // we're going to assume if we're just refreshing - not a full load/reset
                // then the in-memory diagnostics are already up to date via the functions themselves

                // if no source file, then diagnostics won't be useful, as we don't have source data
                if (!notebook.metadata.sourceFile) {
                    continue;
                }
                const sourceFile = vscode.Uri.file(
                    fullPathFromSourceFile(notebook.metadata.sourceFile).fsPath
                );

                // so if we have any data in the existing collection, there's no need to run again
                const issues = value.sourceLevelIssueCollection.get(sourceFile);
                if (issues && issues.length > 0) {
                    continue;
                }
            }
            cells.forEach((cell) => {
                cell.outputs.forEach((output) => {
                    if (output.metadata?.outputType !== value.outputType) {
                        return;
                    }

                    value.onKernelProcessResponseDetails(
                        output.metadata?.details,
                        cell,
                        notebook
                    );
                });
            });
        }
    }

    loadAllAnalysisErrorsFromNotebook(
        notebook: vscode.NotebookDocument | boostnb.BoostNotebook,
        problems: vscode.DiagnosticCollection
    ) {
        const usingBoostNotebook = notebook instanceof boostnb.BoostNotebook;

        if (usingBoostNotebook) {
            notebook.cells.forEach((cell) => {
                cell.outputs.forEach((output) => {
                    output.items.forEach((item) => {
                        //                        let thisItem = item as boostnb.SerializedNotebookCellOutput;

                        if (item.mime !== errorMimeType) {
                            return;
                        }

                        // we use the kernel controller that was attached to this output to deserialize the error
                        // If we can't find the kernel controller metadata, then just use the explain controller
                        this.kernels.forEach(
                            (
                                value: KernelControllerBase,
                                _: string,
                                __: Map<string, KernelControllerBase>
                            ) => {
                                if (
                                    value.outputType !==
                                        output.metadata?.outputType ??
                                    ControllerOutputType.explain
                                ) {
                                    return;
                                }

                                let deserializedError = newErrorFromItemData(
                                    new TextEncoder().encode(item.data)
                                );

                                value.deserializeErrorAsProblems(
                                    notebook,
                                    cell,
                                    deserializedError
                                );
                            }
                        );
                    });
                });
                this.syncProblemsInCell(cell, problems);
            });
        } else {
            notebook.getCells().forEach((cell) => {
                cell.outputs.forEach((output) => {
                    output.items.forEach((item) => {
                        let thisItem = item as vscode.NotebookCellOutputItem;
                        if (thisItem.mime !== errorMimeType) {
                            return;
                        }

                        // we use the kernel controller that was attached to this output to deserialize the error
                        // If we can't find the kernel controller metadata, then just use the explain controller
                        this.kernels.forEach(
                            (
                                value: KernelControllerBase,
                                _: string,
                                __: Map<string, KernelControllerBase>
                            ) => {
                                if (
                                    value.outputType !==
                                        output.metadata?.outputType ??
                                    ControllerOutputType.explain
                                ) {
                                    return;
                                }

                                let deserializedError = newErrorFromItemData(
                                    thisItem.data
                                );

                                value.deserializeErrorAsProblems(
                                    notebook,
                                    cell,
                                    deserializedError
                                );
                            }
                        );
                    });
                });
                this.syncProblemsInCell(cell, problems);
            });
        }
    }

    _setupDiagnosticProblems(
        context: vscode.ExtensionContext
    ): vscode.DiagnosticCollection {
        // create the Problems collection
        const problems = vscode.languages.createDiagnosticCollection(
            boostnb.NOTEBOOK_TYPE + ".problems"
        );

        // whenever we open a boost notebook, we need to re-sync the problems (in case errors were persisted with it)
        vscode.workspace.onDidOpenNotebookDocument((newlyOpenedNotebook) => {
            if (newlyOpenedNotebook.notebookType !== boostnb.NOTEBOOK_TYPE) {
                return;
            }

            if (this.isFileInWorkspace(newlyOpenedNotebook.uri)) {
                // we only use this path to load diagnostics for notebooks/cells outside of the current loaded projects/workspace
                return;
            }

            // load diagnostic problems from a notebook
            this.loadAllAnalysisErrorsFromNotebook(
                newlyOpenedNotebook,
                problems
            );

            this.loadAllSourceLevelErrorsFromNotebook(newlyOpenedNotebook);
        });

        // when the notebook is closed, we need to clear its problems as well
        //    note that problems are tied to the cells, not the notebook
        vscode.workspace.onDidCloseNotebookDocument((event) => {
            if (event.notebookType !== boostnb.NOTEBOOK_TYPE) {
                return;
            }

            event.getCells().forEach((cell) => {
/*
                problems.forEach((value, key) => {
                    boostLogging.debug(
                        `Evaluating ${
                            value.fsPath
                        } against ${cell.document.uri.toString()}`
                    );
                });
*/
                problems.delete(cell.document.uri);
            });
        });

        // Register an event listener for the onDidClearOutput event
        const notebookChangeHandler: vscode.Disposable =
            vscode.workspace.onDidChangeNotebookDocument((event) => {
                // when a cell changes
                for (const cellChange of event.cellChanges) {
                    // if no outputs changed, skip it
                    if (!cellChange.outputs) {
                        continue;
                    }

                    this.syncProblemsInCell(cellChange.cell, problems);
                }

                // when content in a cell changes - look for full deletions of cell
                // Loop through each changed cell content
                for (const changedContent of event.contentChanges) {
                    for (const cell of changedContent.removedCells) {
                        this.syncProblemsInCell(cell, problems, true);
                    }
                }
            });

        // Dispose the event listener when it is no longer needed
        context.subscriptions.push(notebookChangeHandler);

        return problems;
    }

    kernelCommand: string | undefined = undefined;
    setupKernelCommandPicker(context: vscode.ExtensionContext) {
        context.subscriptions.push(
            vscode.commands.registerCommand(
                boostnb.NOTEBOOK_TYPE + ".selectKernelCommand",
                async () => {
                    // Use the vscode.window.showQuickPick method to let the user select kernel
                    let availableKernelItems: any[] = [];
                    let defaultKernelChoice: string | undefined = undefined;
                    this.kernels.forEach((kernel: KernelControllerBase) => {
                        availableKernelItems.push({
                            label: kernel.command,
                            description:
                                "Polyverse Boost: " + kernel.kernelLabel,
                            details: kernel.description,
                        });
                        if (
                            kernel.id ===
                            BoostConfiguration.currentKernelCommand
                        ) {
                            defaultKernelChoice = kernel.command;
                        }
                    });

                    const kernelChoice = await vscode.window.showQuickPick(
                        availableKernelItems,
                        {
                            title: "Choose a Kernel to use for processing of all Boost Notebooks and Cells",
                            canPickMany: false,
                            placeHolder:
                                BoostConfiguration.currentKernelCommand ??
                                "Select Boost Kernel",
                            matchOnDescription: true,
                            matchOnDetail: true,
                        }
                    );
                    if (!kernelChoice) {
                        return;
                    }
                    if (!this.kernels.get(kernelChoice.label)) {
                        boostLogging.error(
                            `Invalid or unavailable Boost command: ${kernelChoice.label}`
                        );
                        return;
                    }
                    // store the kernel as current config command - for offline processing
                    this.kernelCommand = kernelChoice.label;
                    BoostConfiguration.currentKernelCommand = this.kernels.get(
                        kernelChoice.label
                    )?.id as string;
                    if (this.kernelStatusBar) {
                        this.kernelStatusBar.text = `Boost Command: ${kernelChoice.label}`;
                    }
                    return BoostConfiguration.currentKernelCommand;
                }
            )
        );
    }

    kernelStatusBar: vscode.StatusBarItem | undefined = undefined;

    setupKernelStatus(context: vscode.ExtensionContext) {
        const kernelStatusBar = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            9
        );
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
        if (
            kernelCommand &&
            kernelCommand !== "" &&
            this.kernelStatusBar.text === "Select Boost Kernel"
        ) {
            boostLogging.error(
                `Invalid Boost command: ${BoostConfiguration.currentKernelCommand} - set a valid Boost kernel name in User Settings or reset to default`
            );
        }

        this.kernelStatusBar.command =
            boostnb.NOTEBOOK_TYPE + ".selectKernelCommand";
        this.kernelStatusBar.show();
        context.subscriptions.push(this.kernelStatusBar);
    }

    private setupTestFrameworkPicker(context: vscode.ExtensionContext) {
        context.subscriptions.push(
            vscode.commands.registerCommand(
                boostnb.NOTEBOOK_TYPE + ".selectTestFramework",
                async () => {
                    //first get the framework from the metadata
                    const currentNotebook =
                        vscode.window.activeNotebookEditor?.notebook;
                    let framework = "";
                    if (currentNotebook) {
                        framework = currentNotebook.metadata.testFramework;
                    }
                    // Use the vscode.window.showQuickPick method to let the user select a framework
                    framework =
                        (await vscode.window.showInputBox({
                            prompt: "Enter a testing framework",
                            placeHolder: framework,
                        })) ?? framework;
                    //put the framework in the metadata
                    if (currentNotebook) {
                        const edit = new vscode.WorkspaceEdit();
                        // get the metadata for the current notebook
                        const metadata = currentNotebook.metadata;
                        // now add or update the test Framework. the metadata object needs to be
                        // cloned first, as it's a read only object
                        let newMetadata = Object.assign({}, metadata);
                        newMetadata.testFramework = framework;
                        edit.set(currentNotebook.uri, [
                            vscode.NotebookEdit.updateNotebookMetadata(newMetadata),
                        ]);
                        await vscode.workspace.applyEdit(edit);
                    }
                }
            )
        );
    }

    private setupOutputLanguagePicker(context: vscode.ExtensionContext) {
        context.subscriptions.push(
            vscode.commands.registerCommand(
                boostnb.NOTEBOOK_TYPE + ".selectOutputLanguage",
                async () => {
                    // Use the vscode.window.showQuickPick method to let the user select a language
                    const language = await vscode.window.showQuickPick(
                        [
                            "python",
                            "ruby",
                            "swift",
                            "rust",
                            "javascript",
                            "typescript",
                            "csharp",
                        ],
                        {
                            canPickMany: false,
                            placeHolder: "Select a language",
                        }
                    );
                    //put the language in the metadata
                    const editor = vscode.window.activeNotebookEditor;

                    const currentNotebook =
                        vscode.window.activeNotebookEditor?.notebook;
                    if (currentNotebook) {
                        const edit = new vscode.WorkspaceEdit();
                        // get the metadata for the current notebook
                        const metadata = currentNotebook.metadata;
                        // now add or update the output language. the metadata object needs to be
                        // cloned first, as it's a read only object
                        let newMetadata = Object.assign({}, metadata);
                        newMetadata.outputLanguage = language;
                        edit.set(currentNotebook.uri, [
                            vscode.NotebookEdit.updateNotebookMetadata(newMetadata),
                        ]);
                        await vscode.workspace.applyEdit(edit);
                    }
                }
            )
        );
    }

    setupNotebookEnvironment(
        context: vscode.ExtensionContext,
        collection: vscode.DiagnosticCollection
    ) {
        context.subscriptions.push(
            vscode.workspace.registerNotebookSerializer(
                boostnb.NOTEBOOK_TYPE,
                new BoostContentSerializer(),
                { transientOutputs: false }
            )
        );
        let kernelTypes : any[] = [
            BoostConvertKernel,
            BoostExplainKernel,
            BoostAnalyzeKernel,
            BoostTestgenKernel,
            BoostComplianceKernel,
            BoostFlowDiagramKernel,
            BoostCustomProcessKernel,
            BoostAnalyzeFunctionKernel,
            BoostComplianceFunctionKernel,
            BoostPerformanceFunctionKernel,
            BoostPerformanceKernel,
            BoostQuickBlueprintKernel,
            BoostQuickComplianceSummaryKernel,
            BoostQuickSecuritySummaryKernel,
            BoostQuickPerformanceSummaryKernel,
            BoostChatKernel,
            BoostCustomQuickScanFunctionKernel,
            BoostConvertFunctionKernel,
            BoostTestGenerateFunctionKernel,
        ];
        const devKernelTypes: any[] = [
            BoostArchitectureBlueprintKernel,
            BoostCodeGuidelinesKernel,
            SummarizeKernel,
        ];
        // if in dev mode, register all dev only kernels
        if (BoostConfiguration.enableDevOnlyKernels) {
            // register the dev only kernels
            kernelTypes = kernelTypes.concat(devKernelTypes);
        }
        // constructor and save all kernels
        for (const kernelType of kernelTypes) {
            const kernel = new kernelType(
                context,
                this.updateBoostAccountStatus,
                this,
                collection
            );
            this.kernels.set(kernel.command, kernel);
            // ensure all kernels are registered as subscriptions for disposal on exit
            context.subscriptions.push(kernel);
        }
    }

    setupDashboard(context: vscode.ExtensionContext) {
        try {
            this.summary = new BoostSummaryViewProvider(context, this);
        
            context.subscriptions.push(
                vscode.window.registerWebviewViewProvider(
                    summaryViewType,
                    this.summary
                )
            );
        } catch (error) {
            boostLogging.error(
                `Error creating Boost Summary View: ${errorToString(error)}`,
                true
            );
        }
        try {
            this.chat = new BoostChatViewProvider(context, this);

            context.subscriptions.push(
                vscode.window.registerWebviewViewProvider(
                    BoostChatViewProvider.viewType,
                    this.chat
                )
            );
        } catch (error) {
            boostLogging.error(
                `Error creating Boost Chat View: ${errorToString(error)}`,
                true
            );
        }
        try {
            this.start = new BoostStartViewProvider(context, this);

            context.subscriptions.push(
                vscode.window.registerWebviewViewProvider(
                    BoostStartViewProvider.viewType,
                    this.start
                )
            );
        } catch (error) {
            boostLogging.error(
                `Error creating Boost Start View: ${errorToString(error)}`,
                true
            );
        }

        this.docs = new BoostMarkdownViewProvider(context, this, "docxw");

        this.security = new BoostMarkdownViewProvider(
            context,
            this,
            BoostUserAnalysisType.security
        );

        /*
        this.performance = new BoostMarkdownViewProvider(
            context,
            this,
            BoostUserAnalysisType.performance
        );
        */

        this.compliance = new BoostMarkdownViewProvider(
            context,
            this,
            BoostUserAnalysisType.compliance
        );

        this.blueprint = new BoostMarkdownViewProvider(
            context,
            this,
            BoostUserAnalysisType.blueprint
        );

        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider(
                "polyverse-boost-doc-view",
                this.docs
            )
        );
        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider(
                "polyverse-boost-security-view",
                this.security
            )
        );
        /*
        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider(
                "polyverse-boost-performance-view",
                this.performance
            )
        );
*/
        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider(
                "polyverse-boost-compliance-view",
                this.compliance
            )
        );
        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider(
                "polyverse-boost-blueprint-view",
                this.blueprint
            )
        );

        context.subscriptions.push(
            vscode.commands.registerCommand(
                boostnb.NOTEBOOK_TYPE + "." + BoostCommands.showWalkthrough,
                async () => {
                    await vscode.commands.executeCommand(
                        "workbench.action.openWalkthrough",
                        "polyversecorporation" + "." + boostnb.NOTEBOOK_TYPE + "#" + "gettingStarted",
                        false
                    );
                }
            )
        );
    }

    registerCreateNotebookCommand(
        context: vscode.ExtensionContext,
        problems: vscode.DiagnosticCollection
    ) {
        context.subscriptions.push(
            vscode.commands.registerCommand(
                boostnb.NOTEBOOK_TYPE + ".createJsonNotebook",
                async () => {
                    // we prepopulate the notebook with the instructions (as markdown)
                    const language = "markdown";
                    const defaultInstructionData = instructions.markdown;
                    const cell = new vscode.NotebookCellData(
                        vscode.NotebookCellKind.Markup,
                        defaultInstructionData,
                        language
                    );
                    const data = new vscode.NotebookData([cell]);

                    // get the defaults
                    const settings = vscode.workspace.getConfiguration(
                        boostnb.NOTEBOOK_TYPE
                    );

                    // only use test Framework if specified
                    if (settings.testFramework) {
                        data.metadata = {
                            outputLanguage: settings.outputLanguage,
                            testFramework: settings.testFramework,
                            defaultDir: settings.defaultDir,
                        };
                    } else {
                        data.metadata = {
                            outputLanguage: settings.outputLanguage,
                            defaultDir: settings.defaultDir,
                        };
                    }

                    const doc = await vscode.workspace.openNotebookDocument(
                        boostnb.NOTEBOOK_TYPE,
                        data
                    );

                    const editor = await vscode.window.showNotebookDocument(
                        doc
                    );
                }
            )
        );
    }

    registerOpenCodeFile(context: vscode.ExtensionContext) {
        // Register a command to handle the button click
        context.subscriptions.push(
            vscode.commands.registerCommand(
                boostnb.NOTEBOOK_TYPE + ".loadCodeFile",
                async () => {
                    // Get all the cells in the newly created notebook
                    const notebookEditor = vscode.window.activeNotebookEditor;
                    // this should never happen, if it does, we are doing Notebook operations without a Notebook
                    if (notebookEditor === undefined) {
                        boostLogging.error(
                            "Currently active editor is not a Boost Notebook.",
                            true
                        );
                        return;
                    }

                    // see if the user added any data to the cells - since reloading will destroy it
                    const existingCells = notebookEditor.notebook.getCells();
                    let userEnteredData = false;
                    existingCells.forEach((notebookCell) => {
                        if (
                            notebookCell.metadata === undefined &&
                            notebookCell.document.getText().trim() === ""
                        ) {
                            userEnteredData = true;
                        }
                    });

                    if (userEnteredData) {
                        boostLogging.warn(
                            "Existing User-entered data in Cells will be discarded upon loading a new file.",
                            true
                        );
                    } else if (existingCells.length > 0) {
                        boostLogging.info(
                            "Previously loaded content will be discarded upon loading a new file."
                        );
                    }

                    // Use the vscode.window.showOpenDialog method to let the user select a file
                    const fileUri = await vscode.window.showOpenDialog({
                        canSelectMany: false,
                        openLabel: "Load Code File",
                        filters: {
                            // eslint-disable-next-line @typescript-eslint/naming-convention
                            "All Files": ["*"],
                        },
                    });

                    if (fileUri === undefined || fileUri[0] === undefined) {
                        return;
                    } else if (fileUri.length > 1) {
                        boostLogging.warn(
                            "Only one source file can be loaded at a time.",
                            true
                        );
                    }

                    try {
                        await parseFunctionsFromFile(
                            fileUri[0],
                            notebookEditor.notebook
                        );
                    } catch (error) {
                        boostLogging.error(
                            `Unable to Boost file:[${fileUri[0].fsPath.toString()} due to error:${errorToString(error)}`,
                            true
                        );
                    }
                }
            )
        );
    }

    async loadCurrentFolder(
        targetFolder: vscode.Uri,
        context: vscode.ExtensionContext
    ) {
        const files = (await getAllProjectFiles({ targetFolder: targetFolder, enforceFileLimit: false })).map(
            (file: string) => {
                return vscode.Uri.file(file);
            }
        );
        if (!targetFolder) {
            targetFolder = vscode.workspace.workspaceFolders![0].uri;
        }
        boostLogging.debug(
            "Analyzing " + files.length + " files in folder: " + targetFolder
        );
        try {
            let newNotebookWaits: Promise<
                vscode.NotebookDocument | boostnb.BoostNotebook
            >[] = [];

            files.forEach((file: vscode.Uri) => {
                newNotebookWaits.push(
                    createOrOpenNotebookFromSourceFile(file, true)
                );
                newNotebookWaits.push(
                    createOrOpenSummaryNotebookFromSourceFile(file)
                );
            });

            // create project level rollup
            newNotebookWaits.push(
                createOrOpenSummaryNotebookFromSourceFile(targetFolder)
            );

            function reflect(promise: Promise<any>) {
                return promise.then(
                    (v) => ({ v, status: "fulfilled" }),
                    (e) => ({ e, status: "rejected" })
                );
            }

            // Apply reflect to each promise
            let reflectedPromises = newNotebookWaits.map(reflect);

            await Promise.all(reflectedPromises).then((results) => {
                const createdNotebooks = results
                    .filter((result) => result.status === "fulfilled")
                    .map((result) => (result as { v: any; status: string }).v);

                const errors = results
                    .filter((result) => result.status === "rejected")
                    .map((result) => (result as { e: any; status: string }).e);

                // we are generally creating one new notebook during this process, but in case, we de-dupe it
                const newNotebooks = createdNotebooks.filter(
                    (value, index, self) => {
                        return self.indexOf(value) === index;
                    }
                );
                for (const notebook of newNotebooks) {
                    // we let user know the new scratch notebook was created
                    boostLogging.info(
                        "Boost Notebook reloaded: " + notebook.fsPath,
                        false
                    );
                }
                boostLogging.info(
                    `${newNotebooks.length.toString()} Boost Notebooks reloaded for folder ${
                        targetFolder.fsPath
                    }`,
                    false
                );

                // Handle the errors here
                for (const error of errors) {
                    boostLogging.error(
                        `Error Boosting folder ${
                            targetFolder.fsPath
                        } due to Error: ${errorToString(error)}`
                    );
                }
            });
        } catch (error) {
            boostLogging.error(
                `Error Boosting folder ${targetFolder} due to Error: ${errorToString(
                    error
                )}`
            );
        }
    }

    registerFolderRightClickAnalyzeCommand(context: vscode.ExtensionContext) {
        let disposable = vscode.commands.registerCommand(
            boostnb.NOTEBOOK_TYPE + "." + BoostCommands.loadCurrentFolder,
            async (uri: vscode.Uri) => {
                await this.waitForActivationToFinish();

                await this.loadCurrentFolder(uri, context);
            }
        );
        context.subscriptions.push(disposable);

        disposable = vscode.commands.registerCommand(
            boostnb.NOTEBOOK_TYPE + "." + BoostCommands.processCurrentFolder,
            async (options: ProcessCurrentFolderOptions) => {
                await this.waitForActivationToFinish();

                const likelyViaUI =
                    !options.kernelCommand ||
                    typeof options.kernelCommand !== "string";
                if (likelyViaUI) {
                    options.kernelCommand =
                        BoostConfiguration.currentKernelCommand;
                }
                try {
                    return await this.processCurrentFolder(options, context).catch(
                        (error) => {
                            boostLogging.error(errorToString(error), likelyViaUI);
                        }
                    );
                } finally {
                    this.summary?.refresh(likelyViaUI);
                }
            }
        );
        context.subscriptions.push(disposable);
    }

    registerFileExplorerRightClickAnalysisSelectionCommands(
        context: vscode.ExtensionContext
    ) {
        context.subscriptions.push(vscode.commands.registerCommand(
            boostnb.NOTEBOOK_TYPE +
                "." +
                BoostCommands.excludeTargetFromBoostAnalysis,
            async (uri: vscode.Uri) => {
                if (!uri) {
                    boostLogging.warn(
                        "No exclusion target was provided.",
                        false
                    );
                    return;
                }

                updateBoostIgnoreForTarget(uri.fsPath);
                removeFromBoostOnly(uri.fsPath);
                await this.refreshProjectDataCacheForWorkspaceFolder(vscode.workspace.workspaceFolders![0]).then(() => {
                    this.start?.refresh();
                    this.summary?.refresh();
                });
            }
        ));

        context.subscriptions.push(vscode.commands.registerCommand(
            boostnb.NOTEBOOK_TYPE +
                "." +
                BoostCommands.excludeTargetFolderFromBoostAnalysis,
            async (uri: vscode.Uri) => {
                if (!uri) {
                    boostLogging.warn(
                        "No exclusion target was provided.",
                        false
                    );
                    return;
                }

                updateBoostIgnoreForTarget(uri.fsPath);
                removeFromBoostOnly(uri.fsPath);
                await this.refreshProjectDataCacheForWorkspaceFolder(vscode.workspace.workspaceFolders![0]).then(() => {
                    this.start?.refresh();
                    this.summary?.refresh();
                });
            }
        ));

        context.subscriptions.push(vscode.commands.registerCommand(
            boostnb.NOTEBOOK_TYPE +
                "." +
                BoostCommands.analyzeOnlyTargetForBoostAnalysis,
            async (uri: vscode.Uri) => {
                if (!uri) {
                    boostLogging.warn(
                        "No inclusion target was provided.",
                        false
                    );
                    return;
                }

                addToBoostOnly(uri.fsPath);
                await this.refreshBoostProjectsData().then(() => {
                    this.start?.refresh();
                    this.summary?.refresh();
                });
            }
        ));

        context.subscriptions.push(vscode.commands.registerCommand(
            boostnb.NOTEBOOK_TYPE +
                "." +
                BoostCommands.analyzeOnlyTargetFolderForBoostAnalysis,
            async (uri: vscode.Uri) => {
                if (!uri) {
                    boostLogging.warn(
                        "No inclusion target was provided.",
                        false
                    );
                    return;
                }

                addToBoostOnly(uri.fsPath);
                await this.refreshBoostProjectsData().then(() => {
                    this.start?.refresh();
                    this.summary?.refresh();
                });
            }
        ));

        context.subscriptions.push(vscode.commands.registerCommand(
            boostnb.NOTEBOOK_TYPE +
                "." +
                BoostCommands.includeTargetFromBoostAnalysis,
            async (uri: vscode.Uri) => {
                if (!uri) {
                    boostLogging.warn(
                        "No inclusion target was provided.",
                        false
                    );
                    return;
                }

                addToBoostInclude(uri.fsPath);
                await this.refreshBoostProjectsData().then(() => {
                    this.start?.refresh();
                    this.summary?.refresh();
                });
            }
        ));

        context.subscriptions.push(vscode.commands.registerCommand(
            boostnb.NOTEBOOK_TYPE +
                "." +
                BoostCommands.includeTargetFolderFromBoostAnalysis,
            async (uri: vscode.Uri) => {
                if (!uri) {
                    boostLogging.warn(
                        "No inclusion target was provided.",
                        false
                    );
                    return;
                }

                addToBoostInclude(uri.fsPath);
                await this.refreshBoostProjectsData().then(() => {
                    this.start?.refresh();
                    this.summary?.refresh();
                });
            }
        ));
    }

    registerFileExplorerRightClickOutputCommands(
        context: vscode.ExtensionContext
    ) {
        // register the command to build the current file
        let disposable = vscode.commands.registerCommand(
            boostnb.NOTEBOOK_TYPE + "." + BoostCommands.buildCurrentFileOutput,
            async (uri: vscode.Uri, outputFormat: string) => {
                if (!uri) {
                    boostLogging.error(
                        `Unable to generate analysis output for current file due to no file selected`,
                        true
                    );
                    return;
                }

                await this.waitForActivationToFinish();

                await this.buildCurrentFileOutput(
                    uri,
                    false,
                    outputFormat
                        ? outputFormat
                        : BoostConfiguration.defaultOutputFormat,
                    context
                )
                    .then((outputFile: string) => {
                        const relativeOutputFile = vscode.workspace
                            .workspaceFolders
                            ? path.relative(
                                  vscode.workspace.workspaceFolders[0].uri
                                      .fsPath,
                                  outputFile
                              )
                            : outputFile;

                        boostLogging.info(
                            `${relativeOutputFile} created`,
                            false
                        );
                    })
                    .catch((error: any) => {
                        const relativeSourcePath = vscode.workspace
                            .workspaceFolders
                            ? uri
                                ? path.relative(
                                      vscode.workspace.workspaceFolders[0].uri
                                          .fsPath,
                                      uri.fsPath
                                  )
                                : path.basename(
                                      vscode.workspace.workspaceFolders[0].uri
                                          .fsPath
                                  )
                            : uri.fsPath;

                        boostLogging.error(
                            `Unable to generate detailed ${outputFormat?outputFormat:BoostConfiguration.defaultOutputFormat} output for current file:${relativeSourcePath} due to ${errorToString(
                                error
                            )}`,
                            true
                        );
                    });
            }
        );
        context.subscriptions.push(disposable);

        // register the command to show the current file
        disposable = vscode.commands.registerCommand(
            boostnb.NOTEBOOK_TYPE +
                "." +
                BoostCommands.showCurrentFileAnalysisOutput,
            async (uri: vscode.Uri) => {
                if (!uri) {
                    boostLogging.error(
                        `Unable to generate analysis output for current file due to no file selected`,
                        true
                    );
                    return;
                }

                await this.waitForActivationToFinish();

                await this.buildCurrentFileOutput(
                    uri,
                    false,
                    BoostConfiguration.defaultOutputFormat,
                    context
                )
                    .then(async (outputFile: string) => {
                        const relativeOutputFile = vscode.workspace
                            .workspaceFolders
                            ? path.relative(
                                  vscode.workspace.workspaceFolders[0].uri
                                      .fsPath,
                                  outputFile
                              )
                            : outputFile;
                        const relativeSourcePath = vscode.workspace
                            .workspaceFolders
                            ? uri
                                ? path.relative(
                                      vscode.workspace.workspaceFolders[0].uri
                                          .fsPath,
                                      uri.fsPath
                                  )
                                : path.basename(
                                      vscode.workspace.workspaceFolders[0].uri
                                          .fsPath
                                  )
                            : uri.fsPath;

                        boostLogging.info(
                            `${relativeOutputFile} created for file:${relativeSourcePath}.`,
                            false
                        );

                        // show the file now
                        switch (BoostConfiguration.defaultOutputFormat) {
                            case "markdown":
                                await vscode.commands
                                    .executeCommand(
                                        "markdown.showPreview",
                                        vscode.Uri.file(outputFile)
                                    )
                                    .then(
                                        (success) => {
                                            boostLogging.info(
                                                `Markdown Preview opened for ${relativeOutputFile}`,
                                                true
                                            );
                                        },
                                        (reason) => {
                                            boostLogging.error(
                                                `Unable to open Markdown Preview for ${relativeOutputFile} due to ${
                                                    (reason as Error).message
                                                }`,
                                                true
                                            );
                                        }
                                    );
                                break;
                            case "pdf":
                            case "html":
                                await vscode.env
                                    .openExternal(vscode.Uri.file(outputFile))
                                    .then(
                                        (success) => {
                                            boostLogging.info(
                                                `${BoostConfiguration.defaultOutputFormat.toUpperCase()} Preview opened for ${relativeOutputFile}`,
                                                true
                                            );
                                        },
                                        (reason) => {
                                            boostLogging.error(
                                                `Unable to open ${BoostConfiguration.defaultOutputFormat.toUpperCase()} Preview for ${relativeOutputFile} due to ${errorToString(
                                                    reason
                                                )}`,
                                                true
                                            );
                                        }
                                    );
                                break;
                            default:
                                boostLogging.error(
                                    `Unable to open output for ${relativeOutputFile} due to unknown format ${BoostConfiguration.defaultOutputFormat}`,
                                    true
                                );
                        }
                    })
                    .catch((error: any) => {
                        const relativeSourcePath = vscode.workspace
                            .workspaceFolders
                            ? uri
                                ? path.relative(
                                      vscode.workspace.workspaceFolders[0].uri
                                          .fsPath,
                                      uri.fsPath
                                  )
                                : path.basename(
                                      vscode.workspace.workspaceFolders[0].uri
                                          .fsPath
                                  )
                            : uri.fsPath;

                        boostLogging.error(
                            `Unable to generate and show output for current file ${relativeSourcePath} due to ${errorToString(
                                error
                            )}`,
                            true
                        );
                    });
            }
        );

        context.subscriptions.push(disposable);

        // build analysis output files for all files in the current folder
        disposable = vscode.commands.registerCommand(
            boostnb.NOTEBOOK_TYPE +
                "." +
                BoostCommands.buildCurrentFolderOutput,
            async (uri: vscode.Uri, outputFormat: string) => {
                await this.waitForActivationToFinish();

                await this.buildCurrentFolderOutput(
                    uri,
                    outputFormat
                        ? outputFormat
                        : BoostConfiguration.defaultOutputFormat,
                    context
                ).catch((error: any) => {
                    boostLogging.error(errorToString(error));
                });
            }
        );
        context.subscriptions.push(disposable);

        // register the command to build the current file summary
        disposable = vscode.commands.registerCommand(
            boostnb.NOTEBOOK_TYPE +
                "." +
                BoostCommands.buildCurrentFileSummaryOutput,
            async (uri: vscode.Uri, outputFormat: string) => {
                if (!uri) {
                    boostLogging.error(
                        `Unable to generate analysis summary output for current file due to no file selected`,
                        true
                    );
                    return;
                }

                await this.waitForActivationToFinish();

                await this.buildCurrentFileOutput(
                    uri,
                    true,
                    outputFormat
                        ? outputFormat
                        : BoostConfiguration.defaultOutputFormat,
                    context
                )
                    .then((outputFile: string) => {
                        const relativeOutputFile = vscode.workspace
                            .workspaceFolders
                            ? path.relative(
                                  vscode.workspace.workspaceFolders[0].uri
                                      .fsPath,
                                  outputFile
                              )
                            : outputFile;
                        const relativeSourcePath = vscode.workspace
                            .workspaceFolders
                            ? uri
                                ? path.relative(
                                      vscode.workspace.workspaceFolders[0].uri
                                          .fsPath,
                                      uri.fsPath
                                  )
                                : path.basename(
                                      vscode.workspace.workspaceFolders[0].uri
                                          .fsPath
                                  )
                            : uri.fsPath;

                        boostLogging.info(
                            `${relativeOutputFile} created for file:${relativeSourcePath}.`,
                            uri === undefined
                        );
                    })
                    .catch((error: any) => {
                        const relativeSourcePath = vscode.workspace
                            .workspaceFolders
                            ? uri
                                ? path.relative(
                                      vscode.workspace.workspaceFolders[0].uri
                                          .fsPath,
                                      uri.fsPath
                                  )
                                : path.basename(
                                      vscode.workspace.workspaceFolders[0].uri
                                          .fsPath
                                  )
                            : uri.fsPath;

                        boostLogging.error(
                            `Unable to generate summary ${outputFormat?outputFormat:BoostConfiguration.defaultOutputFormat} output for current file:${relativeSourcePath} due to ${errorToString(
                                error
                            )}`,
                            true
                        );
                    });
            }
        );
        context.subscriptions.push(disposable);

        // register the command to show the current file as a summary
        disposable = vscode.commands.registerCommand(
            boostnb.NOTEBOOK_TYPE +
                "." +
                BoostCommands.showCurrentFileAnalysisSummaryOutput,
            async (uri: vscode.Uri) => {
                if (!uri) {
                    boostLogging.error(
                        `Unable to show analysis summary output for current file due to no file selected`,
                        true
                    );
                    return;
                }

                await this.waitForActivationToFinish();

                await this.buildCurrentFileOutput(
                    uri,
                    true,
                    BoostConfiguration.defaultOutputFormat,
                    context
                )
                    .then(async (outputFile: string) => {
                        const relativeOutputFile = vscode.workspace
                            .workspaceFolders
                            ? path.relative(
                                  vscode.workspace.workspaceFolders[0].uri
                                      .fsPath,
                                  outputFile
                              )
                            : outputFile;
                        const relativeSourcePath = vscode.workspace
                            .workspaceFolders
                            ? uri
                                ? path.relative(
                                      vscode.workspace.workspaceFolders[0].uri
                                          .fsPath,
                                      uri.fsPath
                                  )
                                : path.basename(
                                      vscode.workspace.workspaceFolders[0].uri
                                          .fsPath
                                  )
                            : uri.fsPath;

                        boostLogging.info(
                            `${relativeOutputFile} created for file:${relativeSourcePath}.`,
                            uri === undefined
                        );

                        // show the file now
                        switch (BoostConfiguration.defaultOutputFormat) {
                            case "markdown":
                                await vscode.commands
                                    .executeCommand(
                                        "markdown.showPreview",
                                        vscode.Uri.file(outputFile)
                                    )
                                    .then(
                                        (success) => {
                                            boostLogging.info(
                                                `Markdown Preview opened for ${relativeOutputFile}`,
                                                false
                                            );
                                        },
                                        (reason) => {
                                            boostLogging.error(
                                                `Unable to open Markdown Preview for ${relativeOutputFile} due to ${errorToString(
                                                    reason
                                                )}`,
                                                false
                                            );
                                        }
                                    );
                                break;
                            case "pdf":
                            case "html":
                                await vscode.env
                                    .openExternal(vscode.Uri.file(outputFile))
                                    .then(
                                        (success) => {
                                            boostLogging.info(
                                                `${BoostConfiguration.defaultOutputFormat.toUpperCase()} Preview opened for ${relativeOutputFile}`,
                                                true
                                            );
                                        },
                                        (reason) => {
                                            boostLogging.error(
                                                `Unable to open ${BoostConfiguration.defaultOutputFormat.toUpperCase()} ` +
                                                    `Preview for ${relativeOutputFile} due to ${errorToString(
                                                        reason
                                                    )}`,
                                                true
                                            );
                                        }
                                    );
                                break;
                            default:
                                boostLogging.error(
                                    `Unable to open output for ${relativeOutputFile} due to unknown format ${BoostConfiguration.defaultOutputFormat}`,
                                    true
                                );
                        }
                    })
                    .catch((error: any) => {
                        const relativeSourcePath = path.relative(
                            vscode.workspace.workspaceFolders![0].uri.fsPath,
                            uri.fsPath
                        );

                        boostLogging.error(
                            `Unable to generate and show summary output for current file:${relativeSourcePath} due to ${errorToString(
                                error
                            )}`,
                            true
                        );
                    });
            }
        );
        context.subscriptions.push(disposable);

        // register the command to build the current folder summary
        disposable = vscode.commands.registerCommand(
            boostnb.NOTEBOOK_TYPE +
                "." +
                BoostCommands.buildCurrentFolderSummaryOutput,
            async (uri: vscode.Uri) => {
                await this.waitForActivationToFinish();

                await this.buildCurrentFileOutput(
                    uri,
                    true,
                    BoostConfiguration.defaultOutputFormat,
                    context
                )
                    .then((outputFile: string) => {
                        const relativeOutputFile = vscode.workspace
                            .workspaceFolders
                            ? path.relative(
                                  vscode.workspace.workspaceFolders[0].uri
                                      .fsPath,
                                  outputFile
                              )
                            : outputFile;
                        const relativeSourcePath = vscode.workspace
                            .workspaceFolders
                            ? uri
                                ? path.relative(
                                      vscode.workspace.workspaceFolders[0].uri
                                          .fsPath,
                                      uri.fsPath
                                  )
                                : path.basename(
                                      vscode.workspace.workspaceFolders[0].uri
                                          .fsPath
                                  )
                            : uri.fsPath;

                        if (!uri) {
                            boostLogging.info(
                                `${relativeOutputFile} created`,
                                false
                            );
                        } else {
                            boostLogging.info(
                                `${relativeOutputFile} created for file:${relativeSourcePath}.`,
                                false
                            );
                        }
                    })
                    .catch((error: any) => {
                        const relativeSourcePath = vscode.workspace
                            .workspaceFolders
                            ? uri
                                ? path.relative(
                                      vscode.workspace.workspaceFolders[0].uri
                                          .fsPath,
                                      uri.fsPath
                                  )
                                : path.basename(
                                      vscode.workspace.workspaceFolders[0].uri
                                          .fsPath
                                  )
                            : uri.fsPath;

                        boostLogging.error(
                            `Unable to generate summary output for current folder${
                                uri ? ":" + relativeSourcePath : ""
                            }` + ` due to ${errorToString(error as Error)}`,
                            false
                        );
                    });
            }
        );
        context.subscriptions.push(disposable);

        // register the command to show the current folder summary
        disposable = vscode.commands.registerCommand(
            boostnb.NOTEBOOK_TYPE +
                "." +
                BoostCommands.showCurrentFolderAnalysisSummaryOutput,
            async (uri: vscode.Uri) => {
                await this.waitForActivationToFinish();

                await this.buildCurrentFileOutput(
                    uri,
                    true,
                    BoostConfiguration.defaultOutputFormat,
                    context
                )
                    .then(async (outputFile: string) => {
                        const relativeOutputFile = vscode.workspace
                            .workspaceFolders
                            ? path.relative(
                                  vscode.workspace.workspaceFolders[0].uri
                                      .fsPath,
                                  outputFile
                              )
                            : outputFile;
                        const relativeSourcePath = vscode.workspace
                            .workspaceFolders
                            ? uri
                                ? path.relative(
                                      vscode.workspace.workspaceFolders[0].uri
                                          .fsPath,
                                      uri.fsPath
                                  )
                                : path.basename(
                                      vscode.workspace.workspaceFolders[0].uri
                                          .fsPath
                                  )
                            : uri.fsPath;

                        if (!uri) {
                            boostLogging.info(
                                `${relativeOutputFile} created`,
                                false
                            );
                        } else {
                            boostLogging.info(
                                `${outputFile} created for file:${relativeSourcePath}.`,
                                false
                            );
                        }

                        // show the file now
                        switch (BoostConfiguration.defaultOutputFormat) {
                            case "markdown":
                                await vscode.commands
                                    .executeCommand(
                                        "markdown.showPreview",
                                        vscode.Uri.file(outputFile)
                                    )
                                    .then(
                                        (success) => {
                                            boostLogging.info(
                                                `Markdown Preview opened for ${relativeOutputFile}`,
                                                false
                                            );
                                        },
                                        (reason) => {
                                            boostLogging.error(
                                                `Unable to open Markdown Preview for ${relativeOutputFile} due to ${
                                                    (reason as Error).message
                                                }`,
                                                true
                                            );
                                        }
                                    );
                                break;
                            case "pdf":
                            case "html":
                                await vscode.env
                                    .openExternal(vscode.Uri.file(outputFile))
                                    .then(
                                        (success) => {
                                            boostLogging.info(
                                                `${BoostConfiguration.defaultOutputFormat.toUpperCase()} Preview opened for ${relativeOutputFile}`,
                                                true
                                            );
                                        },
                                        (reason) => {
                                            boostLogging.error(
                                                `Unable to open ${BoostConfiguration.defaultOutputFormat.toUpperCase()} Preview for ${relativeOutputFile} due to ${
                                                    (reason as Error).message
                                                }`,
                                                true
                                            );
                                        }
                                    );
                                break;
                            default:
                                boostLogging.error(
                                    `Unable to open output for ${relativeOutputFile} due to unknown format ${BoostConfiguration.defaultOutputFormat}`,
                                    true
                                );
                        }
                    })
                    .catch((error: any) => {
                        const relativeSourcePath = vscode.workspace
                            .workspaceFolders
                            ? uri
                                ? path.relative(
                                      vscode.workspace.workspaceFolders[0].uri
                                          .fsPath,
                                      uri.fsPath
                                  )
                                : path.basename(
                                      vscode.workspace.workspaceFolders[0].uri
                                          .fsPath
                                  )
                            : uri.fsPath;
                        boostLogging.error(
                            `Unable to generate and show summary output for current folder:${
                                uri ? ":" + relativeSourcePath : ""
                            } due to ${errorToString(error)}`,
                            true
                        );
                    });
            }
        );
        context.subscriptions.push(disposable);
    }

    registerProjectCommands(context: vscode.ExtensionContext) {
        context.subscriptions.push(vscode.commands.registerCommand(
            boostnb.NOTEBOOK_TYPE + "." + BoostCommands.refreshProjectData,
            async () => {
                await this.refreshBoostProjectsData()
                    .then(() => {
                        boostLogging.info(
                            `Refreshed Boost Project Data.`,
                            false
                        );
                    })
                    .catch((error: any) => {
                        boostLogging.error(
                            `Unable to Refresh Project Data due to error ${errorToString(
                                error as Error
                            )}`,
                            false
                        );
                    });
            }
        ));

        context.subscriptions.push(vscode.commands.registerCommand(
            boostnb.NOTEBOOK_TYPE + "." + BoostCommands.cleanBoostFiles,
            async () => {
                try {
                    await removeOldBoostFiles();

                    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                    if (!workspaceFolder) {
                        return;
                    }

                    this.refreshProjectDataCacheForWorkspaceFolder(workspaceFolder).then(() => {
                        this.start?.refresh();
                        this.summary?.refresh();
                    });
                } catch (error) {
                    boostLogging.error(
                        `Unable to clean Boost files due to error ${errorToString(
                            error as Error
                        )}`,
                        true
                    );
                }
            }
        ));
    }

    async preflightCheckForCustomerStatus(
        context: vscode.ExtensionContext,
        extension: BoostExtension
    ) {
        if (BoostConfiguration.simulateServiceCalls) {
            return;
        }
        const accountStatus = await this.updateBoostAccountStatus(
            context,
            undefined,
            extension
        );
        if (
            accountStatus === "paid" ||
            accountStatus === "trial" ||
            accountStatus === "active"
        ) {
            return;
        } else {
            const errorMessage = 
                `Unable to access Boost Cloud Service due to account status ${accountStatus?accountStatus:"unknown"}. Please check your account settings or contact Polyverse Boost Support.`;
            boostLogging.error(errorMessage, false);
            throw new BoostAuthenticationException(errorMessage);
        }
    }

    registerCustomerPortalCommand(
        context: vscode.ExtensionContext
    ) {
        context.subscriptions.push(
            vscode.commands.registerCommand(
                boostnb.NOTEBOOK_TYPE + "." + BoostCommands.customerPortal,
                async () => {
                    let url;
                    try {
                        let response = await getCustomerStatus(context);
                        url = response["portal_url"];
                    } catch (err: any) {
                        boostLogging.error(
                            `Unable to launch customer portal: ${err.message}. Please contact Polyverse Boost Support`,
                            true
                        );
                        return;
                    }
                    vscode.env.openExternal(vscode.Uri.file(url));
                }
            )
        );
    }

    registerOrganizationCommands(
        context: vscode.ExtensionContext,
        extension: BoostExtension) {
    
        context.subscriptions.push(
            vscode.commands.registerCommand(
                boostnb.NOTEBOOK_TYPE + "." + BoostCommands.selectOrganization,
                async () => {
                    try {
                        if (!await promptUserForOrganization(context)) {
                            return;
                        }
    
                        const organization = context.globalState.get("organization");
                        
                            //now set the selectOrgnanizationButton text
                        if (extension.statusBar) {
                            extension.statusBar.text =
                                "Boost: Organization is " + organization;
    
                            await this.updateBoostAccountStatus(
                                context,
                                undefined,
                                extension
                            );
                        }
                    } catch (err: any) {
                        boostLogging.error(
                            `Unable to select organization: ${err.message}.`,
                            true
                        );
                    }
                }
            )
        );
    
        context.subscriptions.push(
            vscode.commands.registerCommand(
                boostnb.NOTEBOOK_TYPE + "." + BoostCommands.setOrganization,
                async (organizationName: string) : Promise<boolean>  => {
                    try {
                        if (!await setUserOrganization(context, organizationName)) {
                            return false;
                        }
    
                        //now set the selectOrgnanizationButton text
                        if (extension.statusBar) {
                            extension.statusBar.text =
                                "Boost: Organization is " + organizationName;
    
                            await this.updateBoostAccountStatus(
                                context,
                                undefined,
                                extension
                            );
                        }
                        return true;
                    } catch (err: any) {
                        boostLogging.error(
                            `Unable to set organization to ${organizationName}: ${err.message}.`,
                            true
                        );
                        return false;
                    }
                }
            )
        );
    }

    async updateBoostAccountStatus(
        context: vscode.ExtensionContext,
        extraData: any,
        closure: BoostExtension
    ): Promise<string> {
        try {
        return updateBoostStatusColors(context, extraData, closure);
        } finally {
            if (extraData) {
                // if we're processing analysis, then refresh the UI if available
                closure.summary?.refresh(false);
            }
        }
    }
    
    async setupBoostStatus(
        context: vscode.ExtensionContext,
    ) {
        const boostStatusBar = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            10
        );
        this.statusBar = boostStatusBar;
        this.statusBar.text = pendingBoostStatusBarText;
        this.statusBar.color = new vscode.ThemeColor(
            "statusBarItem.warningForeground"
        );
        this.statusBar.backgroundColor = new vscode.ThemeColor(
            "statusBarItem.warningBackground"
        );
        this.statusBar.show();
    
        await refreshBoostOrgStatus(context, this);
    
        vscode.commands.registerCommand(
            boostnb.NOTEBOOK_TYPE + ".boostStatus",
            boostStatusCommand.bind(this)
        );
        this.statusBar.command = boostnb.NOTEBOOK_TYPE + ".boostStatus";
        this.registerOrganizationCommands(context, this);
        context.subscriptions.push(this.statusBar);
    }
    
    registerSourceCodeRightClickCommands(context: vscode.ExtensionContext) {
        context.subscriptions.push(
            vscode.commands.registerCommand(
                boostnb.NOTEBOOK_TYPE + "." + BoostCommands.analyzeSourceCode,
                async () => {
                    const editor = vscode.window.activeTextEditor;

                    if (!editor) {
                        boostLogging.warn(
                            `No active editor found to analyze source code.`,
                            false
                        );
                        return;
                    }

                    // get the user's selected text
                    const dataSource = editor.document.uri.scheme === "file"?vscode.workspace.asRelativePath(editor.document.uri):editor.document.uri.toString();
                    const selectedText = editor.document.getText(
                        editor.selection
                    );
                    if (selectedText === undefined || selectedText === "") {
                        boostLogging.warn(
                            `No text selected to analyze source code.`,
                            true
                        );
                        return;
                    }

                    await this.waitForActivationToFinish();

                    let targetCommand : string | undefined = undefined;
                    // if we're not in dev mode, then user will need to select a kernel
                    //      each time they want to analyze source code
                    if (!BoostConfiguration.enableDevOnlyKernels) {
                        // ask user to select a kernel manually
                        targetCommand = await vscode.commands.executeCommand(boostnb.NOTEBOOK_TYPE + ".selectKernelCommand");
                    } else {
                        targetCommand = BoostConfiguration.currentKernelCommand;
                    }
                    if (!targetCommand) {
                        if (BoostConfiguration.enableDevOnlyKernels) {
                            boostLogging.warn(
                                `Please select an Analysis command type via Boost Status Bar at bottom of screen`,
                                true
                            );
                        }
                        // do nothing if no target command available
                        return;
                    }
                    
                    const targetedKernel : KernelControllerBase | undefined = this.getCurrentKernel(targetCommand);
                    if (targetedKernel === undefined) {
                        boostLogging.warn(
                            `Please select a valid Kernel type for source analysis`,
                            true
                        );
                        return;
                    }

                    // analyze the source code
                    await this.analyzeSourceCode(selectedText, dataSource)
                        .then((analysisResults: string) => {
                            boostLogging.debug(
                                `Result of Source Editor Analyze(${targetedKernel.outputHeader}:${dataSource}): ${analysisResults}`);
                        })
                        .catch((error: any) => {
                            boostLogging.error(
                                `Unable to Analyze Selected Text with ${
                                    BoostConfiguration.currentKernelCommand
                                } due to ${errorToString(error)}`,
                                true
                            );
                        });
                }
            )
        );

        context.subscriptions.push(
            vscode.commands.registerCommand(
                boostnb.NOTEBOOK_TYPE +
                    "." +
                    BoostCommands.analysisSummaryForSourceCode,
                async () => {
                    const currentEditorFile =
                        vscode.window.activeTextEditor?.document.uri;
                    if (!currentEditorFile) {
                        boostLogging.warn(
                            `No active editor found to analyze source code.`,
                            true
                        );
                        return;
                    }

                    const currentSelection =
                        vscode.window.activeTextEditor?.selection;
                    const boostTarget = getBoostFile(currentEditorFile);
                    if (!boostTarget || !fs.existsSync(boostTarget.fsPath)) {
                        boostLogging.warn(
                            `Unable to find Boost Analysis for ${currentEditorFile.fsPath}`,
                            true
                        );
                        return;
                    }

                    await this.waitForActivationToFinish();

                    const analysisNotebook = new boostnb.BoostNotebook();
                    analysisNotebook.load(boostTarget.fsPath);

                    const summary = generateSingleLineSummaryForAnalysisData(
                        this,
                        analysisNotebook,
                        currentSelection
                    );

                    boostLogging.info(summary, true);
                }
            )
        );
    }

    async waitForActivationToFinish() : Promise<void> {
        let totalTimeWaited = 0; // in seconds
        let waitTime = 1; // start off waiting for 1 second

        return new Promise((resolve, reject) => {
            const checkActivation = () => {
                if (this.finishedActivation) {
                    resolve();
                    return;
                }

                totalTimeWaited += waitTime;
                if (totalTimeWaited >= 15) {
                    // 15 seconds timeout
                    boostLogging.error(
                        `Boost extension activation did not complete in ${totalTimeWaited} seconds.`,
                        true
                    );
                    reject(
                        new Error(
                            `Boost extension activation did not complete in ${totalTimeWaited} seconds.`
                        )
                    );
                    return;
                }

                setTimeout(() => {
                    checkActivation();
                    waitTime *= 2; // Double the wait time for the next round
                }, waitTime * 1000);
            };

            // Initial delay and log
            setTimeout(() => {
                if (!this.finishedActivation) {
                    boostLogging.warn(
                        "Boost is still activating. Waiting a few seconds before continuing.",
                        false
                    );
                }
                checkActivation();
            }, 1000);
        });
    }

    registerShowGuidelinesCommand(context: vscode.ExtensionContext) {
        let disposable = vscode.commands.registerCommand(
            boostnb.NOTEBOOK_TYPE + "." + BoostCommands.showGuidelines,
            async (guidelineType) => {
                const globalProjectGuidelineFile = getBoostFile(undefined, {
                    format: BoostFileType.guidelines,
                    showUI: false,
                });
                let projectGuidelineFile;
                if (!guidelineType) {
                    projectGuidelineFile = globalProjectGuidelineFile;
                } else {
                    if (!(guidelineType in BoostUserAnalysisType)) {
                        guidelineType = this.getUserAnalysisType(guidelineType);
                    }
                    // this user guideline file
                    const userGuidelinesFile =
                        globalProjectGuidelineFile.fsPath.replace(
                            boostnb.NOTEBOOK_GUIDELINES_PRE_EXTENSION,
                            `.${guidelineType}${boostnb.NOTEBOOK_GUIDELINES_PRE_EXTENSION}`
                        );
                    projectGuidelineFile = vscode.Uri.file(userGuidelinesFile);
                }

                if (getOrCreateGuideline(projectGuidelineFile, guidelineType)) {
                    boostLogging.info(
                        `No guidelines found for project. Building ${projectGuidelineFile.fsPath}`,
                        false
                    );
                }

                const guidelinesNotebook =
                    await vscode.workspace.openNotebookDocument(
                        projectGuidelineFile
                    );
                await vscode.window.showNotebookDocument(guidelinesNotebook);
            }
        );
        context.subscriptions.push(disposable);

        for (let guidelineTypeKey in BoostUserAnalysisType) {
            if (
                Object.prototype.hasOwnProperty.call(
                    BoostUserAnalysisType,
                    guidelineTypeKey
                )
            ) {
                let guidelineType =
                    BoostUserAnalysisType[
                        guidelineTypeKey as keyof typeof BoostUserAnalysisType
                    ];

                let disposable = vscode.commands.registerCommand(
                    `${boostnb.NOTEBOOK_TYPE}.${BoostCommands.showGuidelines}.${guidelineType}`,
                    async () => {
                        await vscode.commands.executeCommand(
                            `${boostnb.NOTEBOOK_TYPE}.${BoostCommands.showGuidelines}`,
                            guidelineType
                        );
                    }
                );
            }
            context.subscriptions.push(disposable);
        }
    }

    async analyzeSourceCode(selectedText: string, dataSource: string): Promise<string> {
        return new Promise(async (resolve, reject) => {
            try {
                if (selectedText === undefined || selectedText === "") {
                    reject(
                        new Error("No text selected to analyze source code.")
                    );
                    return;
                }

                // use default selected kernel
                const targetedKernel = this.getCurrentKernel(
                    BoostConfiguration.currentKernelCommand
                );
                if (targetedKernel === undefined) {
                    reject(
                        new Error(
                            `Unable to match analysis kernel to analyze source code.`
                        )
                    );
                    return;
                }

                let notebook = new boostnb.BoostNotebook();
                notebook.addCell(
                    new boostnb.BoostNotebookCell(
                        boostnb.NotebookCellKind.Code,
                        selectedText,
                        "plaintext",
                        undefined
                    )
                );
                const cellMetadata = {
                    model: "gpt-3.5-turbo",
                    temperature: 0.1,
                }; // fast-processing model
                notebook.cells[0].initializeMetadata(cellMetadata);

                // make the Activity Bar visible
                await vscode.commands.executeCommand(
                    `workbench.view.extension.${boostActivityBarId}`
                );

                const prompt = `Please run ${targetedKernel.outputHeader} to analyze the selected text from ${dataSource}.`;
                this.chat?.postMessage({
                    command: "chat-send-button-click",
                    externalPromptData: prompt
                });

                let response : string = ""; // empty string is an error response in the chat display
                try {
                    await targetedKernel
                        .executeAllWithAuthorization(notebook.cells, notebook)
                        .then(() => {
                            response = cleanCellOutput(notebook.cells[0].outputs[0].items[0].data);
                            resolve(response);
                        })
                        .catch((error) => {
                            reject(error);
                        });
                } finally {
                    this.chat?.postMessage({
                        command: "new-prompt",
                        prompt: prompt,
                        showUI: true,
                        externalResponse: response,
                    });
                }
            } catch (error) {
                reject(error as Error);
            }
        });
    }

    async loadCurrentFile(
        sourceFileUri: vscode.Uri,
        context: vscode.ExtensionContext
    ): Promise<boolean> {
        return new Promise(async (resolve, reject) => {
            try {
                // if we don't have a file selected, then the user didn't right click
                //      so we need to find the current active editor, if its available
                if (sourceFileUri === undefined) {
                    if (vscode.window.activeTextEditor === undefined) {
                        boostLogging.warn(
                            "Unable to identify an active file to Boost.",
                            true
                        );
                        resolve(false);
                    } else {
                        sourceFileUri =
                            vscode.window.activeTextEditor?.document.uri;

                        if (!fs.existsSync(sourceFileUri.fsPath)) {
                            boostLogging.warn(
                                `Unable to find file ${sourceFileUri.fsPath} to Boost. It may not be saved to disk yet.`,
                                false
                            );
                        }
                    }
                }

                let currentNotebook =
                    vscode.window.activeNotebookEditor?.notebook;
                if (
                    currentNotebook &&
                    sourceFileUri &&
                    currentNotebook.uri.fsPath !== sourceFileUri.fsPath
                ) {
                    // if the open notebook doesn't match, don't use it
                    currentNotebook = undefined;
                }

                // if there is no active notebook editor, we need to find it
                // Note this only happens when using right-click in explorer or a non-Notebook active editor
                if (currentNotebook === undefined && !sourceFileUri) {
                    const boostNotebooks: vscode.NotebookDocument[] =
                        vscode.workspace.notebookDocuments.filter(
                            (doc) => doc.notebookType === boostnb.NOTEBOOK_TYPE
                        );

                    // if we have more than one notebook, we need to ask user which one to use
                    if (boostNotebooks.length > 1) {
                        let notebookNames = boostNotebooks.map((doc) => {
                            return path.basename(
                                vscode.Uri.file(doc.uri.toString()).fsPath
                            );
                        });

                        // show the user a list of available notebooks
                        const selectedOption =
                            await vscode.window.showQuickPick(notebookNames, {
                                canPickMany: false,
                                placeHolder: "Select a Boost Notebook to use",
                            });
                        // if user doesn't pick anything, then just give up
                        if (!selectedOption) {
                            resolve(false);
                            return;
                        }
                        // otherwise find the notebook that matches the user's selection
                        currentNotebook = boostNotebooks.find((doc) => {
                            return (
                                path.basename(
                                    vscode.Uri.file(doc.uri.toString()).fsPath
                                ) === selectedOption
                            );
                        });
                    } else if (boostNotebooks.length === 1) {
                        // if we only have one notebook (that matches Uri), then just use that one
                        currentNotebook = boostNotebooks[0];
                    }
                }

                // if we still failed to find an available Notebook, then warn and give up
                if (currentNotebook === undefined) {
                    if (
                        !sourceFileUri.fsPath.endsWith(
                            boostnb.NOTEBOOK_SUMMARY_EXTENSION
                        )
                    ) {
                        currentNotebook =
                            (await createOrOpenNotebookFromSourceFile(
                                sourceFileUri,
                                false,
                                true
                            )) as vscode.NotebookDocument;
                        await createOrOpenSummaryNotebookFromSourceFile(
                            sourceFileUri
                        );
                    } else {
                        // look up summary for raw source file by stripping off notebook extension
                        const summaryBoostFile = vscode.Uri.file(
                            sourceFileUri.fsPath
                                .replace(boostnb.NOTEBOOK_SUMMARY_EXTENSION, "")
                                .replace(
                                    "/" + BoostConfiguration.defaultDir,
                                    ""
                                )
                        );
                        await createOrOpenSummaryNotebookFromSourceFile(
                            summaryBoostFile
                        );
                        currentNotebook =
                            await vscode.workspace.openNotebookDocument(
                                sourceFileUri
                            );
                    }
                    boostLogging.warn(
                        `No active Notebook found. Created default Notebook for: ${sourceFileUri.toString()}`
                    );
                } else if (
                    !sourceFileUri.fsPath.endsWith(boostnb.NOTEBOOK_EXTENSION)
                ) {
                    await parseFunctionsFromFile(
                        sourceFileUri,
                        currentNotebook
                    );
                }

                boostLogging.log(
                    `Loaded Boost file:[${sourceFileUri.fsPath.toString()}`
                );
                await vscode.window.showNotebookDocument(currentNotebook);
            } catch (error) {
                boostLogging.error(
                    `Unable to load Boost file:[${sourceFileUri.fsPath.toString()} due to error:${errorToString(
                        error
                    )}`,
                    false
                );
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
        forceAnalysisRefresh: boolean = false
    ): Promise<boostnb.BoostNotebook | undefined> {
        return new Promise(async (resolve, reject) => {
            try {
                let inMemorySourceFile = false; // the source file is in memory (either Notebook or raw source)

                // if we don't have a file selected, then the user didn't right click
                // so we need to find the current active editor if it's available
                if (sourceUri === undefined) {
                    if (vscode.window.activeTextEditor === undefined) {
                        boostLogging.warn(
                            `Unable to identify an active file to Process ${kernelCommand}`,
                            true
                        );
                        reject(
                            new Error(
                                `Unable to identify an active file to Process ${kernelCommand}`
                            )
                        );
                        return;
                    } else {
                        sourceUri =
                            vscode.window.activeTextEditor?.document.uri;
                        if (!fs.existsSync(sourceUri.fsPath)) {
                            inMemorySourceFile = true;
                            boostLogging.error(
                                `Canceling in-memory source file processing ${sourceUri.toString()}`,
                                false
                            );
                            reject(
                                new Error(
                                    `Please save ${sourceUri.toString()} before processing`
                                )
                            );
                            return;
                        } else if (
                            vscode.window.activeTextEditor?.document.isDirty
                        ) {
                            boostLogging.warn(
                                `File ${sourceUri.toString()} has unsaved changes.`,
                                true
                            );
                        }
                    }
                }

                const targetedKernel = this.getCurrentKernel(kernelCommand);
                if (targetedKernel === undefined) {
                    boostLogging.warn(
                        `Unable to match analysis kernel for ${kernelCommand}`,
                        false
                    );
                    reject(
                        new Error(
                            `Unable to match analysis kernel for ${kernelCommand}`
                        )
                    );
                    return;
                }

                let notebookUri = sourceUri;
                // if we got a source file or folder, then load the notebook from it
                if (!sourceUri.fsPath.endsWith(boostnb.NOTEBOOK_EXTENSION)) {
                    if (
                        [
                            summarizeKernelName,
                            quickComplianceSummaryKernelName,
                            quickSecuritySummaryKernelName,
                            quickPerformanceSummaryKernelName,
                        ].includes(targetedKernel.command)
                    ) {
                        notebookUri = getBoostFile(sourceUri, {
                            format: BoostFileType.summary,
                        });
                    } else {
                        notebookUri = getBoostFile(sourceUri, {
                            format: BoostFileType.notebook,
                        });
                    }
                } // else we are using a notebook file, so just use it

                let notebook = new boostnb.BoostNotebook();
                if (!fs.existsSync(notebookUri.fsPath)) {
                    if (
                        [
                            summarizeKernelName,
                            quickComplianceSummaryKernelName,
                            quickSecuritySummaryKernelName,
                            quickPerformanceSummaryKernelName,
                        ].includes(targetedKernel.command)
                    ) {
                        // if we haven't yet loaded/parsed this file, then let's do it implicitly for the customer
                        await createOrOpenNotebookFromSourceFile(
                            sourceUri,
                            true
                        );
                        await createOrOpenSummaryNotebookFromSourceFile(
                            sourceUri
                        );

                        notebook.load(notebookUri.fsPath);
                    } else {
                        // if we are summarizing, then we need to create the summary notebook
                        notebook =
                            await createOrOpenSummaryNotebookFromSourceFile(
                                sourceUri
                            );
                    }
                } else {
                    notebook.load(notebookUri.fsPath);
                }
                await targetedKernel
                    .executeAllWithAuthorization(
                        notebook.cells,
                        notebook,
                        forceAnalysisRefresh
                    )
                    .then((refreshed: boolean) => {
                        if (
                            [
                                summarizeKernelName,
                                quickComplianceSummaryKernelName,
                                quickSecuritySummaryKernelName,
                                quickPerformanceSummaryKernelName,
                            ].includes(targetedKernel.command)
                        ) {
                            const summaryNotebookUri = getBoostFile(sourceUri, {
                                format: BoostFileType.summary,
                            });
                            if (!refreshed) {
                                boostLogging.log(
                                    `Update Skipped for Notebook for ${kernelCommand} in file:[${summaryNotebookUri.fsPath}]`,
                                    );
                                resolve(undefined);
                                return;
                            }
                            boostLogging.info(
                                `Saved Updated Notebook for ${kernelCommand} in file:[${summaryNotebookUri.fsPath}]`,
                                false
                            );
                        } else {
                            if (!refreshed) {
                                boostLogging.log(
                                    `Update Skipped for Notebook for ${kernelCommand} in file:[${notebookUri.fsPath}]`,
                                    );
                                resolve(undefined);
                                return;
                            }

                            // ensure we save the notebook if we successfully processed it
                            notebook.save(notebookUri.fsPath);
                            boostLogging.info(
                                `Saved Updated Notebook for ${kernelCommand} in file:[${notebookUri.fsPath}]`,
                                false
                            );
                        }
                        resolve(notebook);
                    })
                    .catch((error) => {
                        boostLogging.warn(
                            `Skipping Notebook save - due to Error Processing ${kernelCommand} on file:[${
                                sourceUri.fsPath
                            }] due to error:${errorToString(error)}`,
                            true
                        );
                        reject(error);
                    });
            } catch (error) {
                reject(error as Error);
            }
        });
    }

    public getUserAnalysisType(kernelName: string): string {
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
            case performanceKernelName:
            case performanceFunctionKernelName:
            case customProcessKernelName:
                return BoostUserAnalysisType.blueprint;
            default:
                return kernelName;
        }
    }

    private getCurrentKernel(
        requestedKernel?: string
    ): KernelControllerBase | undefined {
        if (!requestedKernel && !this.kernelCommand) {
            boostLogging.error(`No Boost Kernel Command selected`, false);
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
            boostLogging.error(
                `Unable to find Kernel for ${requestedKernel}`,
                false
            );
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

    private calculateProcessingTime(
        estimatedWords: number,
        wordsPerFile: number
    ): number {
        const oneMinute = 60 * 1000;
        const processingMinutes = estimatedWords / wordsPerFile;
        const processingMilliseconds = processingMinutes * oneMinute;
        return processingMilliseconds;
    }

    private delay(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    async processCurrentFolder(
        options: ProcessCurrentFolderOptions,
        context: vscode.ExtensionContext
    ): Promise<boolean> {
        let targetFolder: vscode.Uri;
        // if we don't have a folder selected, then the user didn't right click
        // so we need to use the workspace folder
        if (!options?.filelist) {
            if (options?.uri === undefined) {
                if (vscode.workspace.workspaceFolders === undefined) {
                    boostLogging.warn(
                        "Unable to find Workspace Folder. Please open a Project or Folder first",
                        true
                    );
                    return false;
                }

                // use the first folder in the workspace
                targetFolder = vscode.workspace.workspaceFolders[0].uri;
                boostLogging.debug(
                    `Analyzing Project Wide source file in Workspace: ${targetFolder.fsPath}`
                );
            } else {
                targetFolder = options.uri;
                boostLogging.debug(
                    `Analyzing source files in folder: ${options.uri.fsPath}`
                );
            }
        } else {
            if (vscode.workspace.workspaceFolders === undefined) {
                boostLogging.warn(
                    "Unable to find Workspace Folder. Please open a Project or Folder first",
                    true
                );
                return false;
            }
            targetFolder = vscode.workspace.workspaceFolders[0].uri;
            if (!targetFolder) {
                boostLogging.warn(
                    "Unable to find Workspace Folder. Please open a Project or Folder first",
                    true
                );
                return false;
            }
        }

        // if user provided a filelist, use that, otherwise grab everything from the target folder
        let files = options?.filelist;
        if (!files) {
            files = (await getAllProjectFiles({ targetFolder: options?.uri, enforceFileLimit: false })).map(
                (file) => {
                    return vscode.Uri.file(file);
                }
            );
        }
        // limit processing to first N files if file limit is set
        if (options.fileLimit && options.fileLimit > 0) {
            files = files.slice(0, options.fileLimit);
        }

        boostLogging.debug(
            "Analyzing " + files.length + " files in folder: " + targetFolder
        );

        const targetedKernel = this.getCurrentKernel(options?.kernelCommand);
        if (targetedKernel === undefined) {
            return false;
        }

        const boostprojectdata = await this.getBoostProjectData()!;

        try {
            await this.preflightCheckForCustomerStatus(context, this);
        } catch (error) {
            const folderName = path.basename(targetFolder.fsPath);
            boostLogging.error(
                `Unable to process folder ${folderName} due to error: ${errorToString(
                    error
                )}`
            );
            return false;
        }

        // tracks if files were changed
        let refreshed = false;

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

            // TODO: temporary change before going to workflow engines to get the list of relative files
            const relFiles = files.map((file) => {
                let relativePath = path.relative(
                    targetFolder.fsPath,
                    file.fsPath
                );
                return relativePath;
            });

            boostprojectdata.addQueue([targetedKernel.outputType], relFiles);
            this.summary?.refresh();

            let processedNotebookWaits: Promise<
                boostnb.BoostNotebook | undefined
            >[] = files.map(async (file) => {
                return new Promise<boostnb.BoostNotebook | undefined>(
                    (resolve, reject) => {
                        const fileSize = fs.statSync(file.fsPath).size;
                        const estimatedWords =
                            this.calculateEstimatedWords(fileSize);

                        // disable all delays if processing serially in rings/groups
                        // the server will throttle if a limit is hit, so we shoukd queue
                        //      the request as soon as we can
                        const processingTime = 0;

                        boostLogging.log(
                            `Delaying file ${
                                file.fsPath
                            } with ${estimatedWords} ~items to wait ${
                                processingTime / seconds
                            } secs`
                        );
                        // get the distance from the workspace folder for the source file
                        // for project-level status files, we ignore the relative path
                        let relativePath = path.relative(
                            targetFolder.fsPath,
                            file.fsPath
                        );

                        setTimeout(async () => {
                            // if its been more than 5 seconds, log it - that's about 13 pages of source in 5 seconds (wild estimate)
                            if (processingTime > 5 * seconds) {
                                boostLogging.log(
                                    `Starting processing file ${
                                        file.fsPath
                                    } with ${estimatedWords} ~items after waiting ${
                                        processingTime * seconds
                                    } secs`
                                );
                            }
                            this.getBoostProjectData()!.addJobs(
                                targetedKernel.outputType,
                                [relativePath]);
                            this.summary?.refresh();

                            await this.processCurrentFile(
                                file,
                                targetedKernel.id,
                                context,
                                options?.forceAnalysisRefresh
                                    ? options.forceAnalysisRefresh
                                    : false
                            )
                                .then((notebook) => {
                                    if (notebook) {
                                        refreshed = true;

                                        let summary =
                                            boostNotebookToFileSummaryItem(
                                                targetFolder.fsPath,
                                                notebook
                                            );
                                        const boostprojectdata =
                                            this.getBoostProjectData()!;
                                        boostprojectdata.finishJob(
                                            targetedKernel.outputType,
                                            relativePath,
                                            summary,
                                            null);
                                        this.summary?.refresh();
                                    }
                                    resolve(notebook);
                                })
                                .catch((error) => {
                                    // get the distance from the workspace folder for the source file
                                    // for project-level status files, we ignore the relative path
                                    let relativePath = path.relative(
                                        targetFolder.fsPath,
                                        file.fsPath
                                    );
                                    const boostprojectdata =
                                        this.getBoostProjectData()!;
                                    boostprojectdata.finishJob(
                                        targetedKernel.outputType,
                                        relativePath,
                                        null,
                                        error);
                                    this.summary?.refresh();
                                    reject(error);
                                });
                        }, processingTime);
                    }
                );
            });

            function reflect(promise: Promise<any>) {
                return promise.then(
                    (v) => ({ v, status: "fulfilled" }),
                    (e) => ({ e, status: "rejected" })
                );
            }

            let reflectedPromises = processedNotebookWaits.map(reflect);

            await Promise.all(reflectedPromises).then((results) => {
                let successfullyProcessed = true;

                results.forEach((result) => {
                    if (result.status === "fulfilled") {
                        if ((result as { v: any; status: string }).v) {
                            boostLogging.info(
                                `Boost Notebook processed with command ${
                                    targetedKernel.command
                                }: ${
                                    (result as { v: any; status: string }).v
                                        .fsPath
                                }`,
                                false
                            );
                        } else {
                            boostLogging.debug(
                                `Boost Notebook analysis skipped for ${targetedKernel.command} - no unanalyzed content found`
                            );
                        }
                    } else if (result.status === "rejected") {
                        successfullyProcessed = false;
                        boostLogging.error(
                            `Error Boosting folder ${
                                targetFolder.fsPath
                            } due to Error: ${errorToString(
                                (result as { e: any; status: string }).e
                            )}`,
                            false
                        );
                    }
                });

                if (successfullyProcessed) {
                    boostLogging.info(
                        `${reflectedPromises.length.toString()} Boost Notebooks processed for folder ${
                            targetFolder.fsPath
                        }`,
                        false
                    );
                }
            });

            // if we are doing a summary operation, then we process the named folder only (for the project/folder-level summary)
            // this happens after we do rollup summaries for all other source files - to make our project-level use the latest rollup
            if (targetedKernel.command === summarizeKernelName) {
                boostLogging.debug(
                    `Boost Project-level Summary starting with Project: ${targetFolder.fsPath}`
                );
                if (
                    await this.processCurrentFile(
                        targetFolder,
                        targetedKernel.id,
                        context,
                        options?.forceAnalysisRefresh
                            ? options.forceAnalysisRefresh
                            : false
                    )
                ) {
                    refreshed = true;
                }
                boostLogging.info(
                    `Boost Project-level Summary completed with Project: ${targetFolder.fsPath}`,
                    false
                );
            }
        } catch (error) {
            boostLogging.error(
                `Unable to Process ${options?.kernelCommand} on Folder:[${
                    options?.uri
                        ? options.uri.fsPath.toString()
                        : options.filelist?.length.toString() + " files"
                } due to error:${errorToString(error)}`,
                false
            );
        }
        return refreshed;
    }

    registerProjectLevelCommands(context: vscode.ExtensionContext) {
        let disposable = vscode.commands.registerCommand(
            boostnb.NOTEBOOK_TYPE + "." + BoostCommands.processProject,
            async (kernelCommand?: string) => {
                // we only process project level analysis at summary level for now
                const projectBoostFile = getBoostFile(undefined, {
                    format: BoostFileType.summary,
                    showUI: false,
                });
                // create the Boost file, if it doesn't exist
                if (!fs.existsSync(projectBoostFile.fsPath)) {
                    boostLogging.warn(
                        `Unable to open Project-level Boost Notebook [${projectBoostFile.fsPath}]; check the Polyverse Boost Output channel for details`
                    );
                    return;
                }

                const likelyViaUI =
                    !kernelCommand || typeof kernelCommand !== "string";
                if (likelyViaUI) {
                    kernelCommand = BoostConfiguration.currentKernelCommand;
                }

                const targetedKernel = this.getCurrentKernel(kernelCommand);
                if (targetedKernel === undefined) {
                    boostLogging.warn(
                        `Unable to match analysis kernel for ${kernelCommand}`,
                        likelyViaUI
                    );
                    return;
                }

                if (
                    ![
                        quickBlueprintKernelName,
                        quickComplianceSummaryKernelName,
                        quickSecuritySummaryKernelName,
                        quickPerformanceSummaryKernelName,
                    ].includes(targetedKernel.command)
                ) {
                    boostLogging.error(
                        "Currently, only Quick Analysis is supported at Project-level",
                        likelyViaUI
                    );
                    return;
                }

                await this.waitForActivationToFinish();

                let notebook = new boostnb.BoostNotebook();
                notebook.load(projectBoostFile.fsPath);
                return targetedKernel
                    .executeAllWithAuthorization(notebook.cells, notebook, true)
                    .then(async (refreshed: boolean) => {
                        // ensure we save the notebook if we successfully processed it
                        notebook.flushToFS();
                        switch (targetedKernel.command) {
                            case quickBlueprintKernelName:
                                this.blueprint?.refresh();
                                this.summary?.refresh();
                                break;
                            case quickComplianceSummaryKernelName:
                                this.compliance?.refresh();
                                this.summary?.refresh();
                                break;
                            case quickSecuritySummaryKernelName:
                                this.security?.refresh();
                                this.summary?.refresh();
                                break;
                            case quickPerformanceSummaryKernelName:
                                this.performance?.refresh();
                                this.summary?.refresh();
                                break;
                            default:
                                throw new Error(
                                    `Unknown Project Level command ${targetedKernel.command}`
                                );
                                break;
                        }

                        const relativeProjectPath = vscode.workspace.asRelativePath(
                            projectBoostFile.fsPath
                        );
                        boostLogging.info(
                            `Saved Updated Notebook for ${kernelCommand} in file:[${relativeProjectPath}]`,
                            likelyViaUI
                        );

                        if (
                            targetedKernel.command !== quickBlueprintKernelName
                        ) {
                            return;
                        }

                        // if the quick-blueprint provided recommended file exclusion list
                        //      then let's add those to the ignore file for future analysis
                        const blueprintCell = findCellByKernel(
                            notebook,
                            targetedKernel.outputType
                        );
                        // we only use recommendation from quick-blueprint
                        if (
                            blueprintCell?.metadata?.blueprintType !== "quick"
                        ) {
                            return;
                        }

                        // if we don't have a boostignore file, then do the update and create one
                        // if we have one, then already generated it and skip this step.
                        const boostIgnoreFile = getBoostIgnoreFile();
                        if (
                            boostIgnoreFile === undefined ||
                            !fs.existsSync(boostIgnoreFile.fsPath)
                        ) {
                            blueprintCell?.outputs.forEach((output) => {
                                if (
                                    output.metadata.outputType !==
                                        targetedKernel.outputType ||
                                    !output?.metadata?.details
                                        ?.recommendedListOfFilesToExcludeFromAnalysis
                                ) {
                                    return;
                                }

                                output.metadata.details.recommendedListOfFilesToExcludeFromAnalysis.forEach(
                                    (filename: string) => {
                                        updateBoostIgnoreForTarget(
                                            filename,
                                            false,
                                            false,
                                            false
                                        );
                                    }
                                );
                            });

                            await this.refreshProjectDataCacheForWorkspaceFolder(vscode.workspace.workspaceFolders![0]).then(() => {
                                this.start?.refresh();
                                this.summary?.refresh();
                            });
            
                        } else {
                            const relativeBoostIgnorePath = vscode.workspace.asRelativePath(
                                boostIgnoreFile.fsPath
                            );
                            boostLogging.log(
                                `Skipping automatic AI generation of [${relativeBoostIgnorePath}] as it already exists`
                            );
                        }
                    })
                    .catch((error) => {
                        const relativeProjectPath = vscode.workspace.asRelativePath(projectBoostFile.fsPath);
                        boostLogging.warn(
                            `Skipping Notebook save - due to Error Processing ${kernelCommand} on file:[${
                                relativeProjectPath
                            }] due to error:${errorToString(error)}`,
                            likelyViaUI
                        );
                    });
            }
        );
        context.subscriptions.push(disposable);
    }

    registerFileRightClickAnalyzeCommand(context: vscode.ExtensionContext) {
        context.subscriptions.push(vscode.commands.registerCommand(
            boostnb.NOTEBOOK_TYPE + "." + BoostCommands.loadCurrentFile,
            async (uri: vscode.Uri) => {
                await this.waitForActivationToFinish();

                const boostFile = getBoostFile(uri);
                // create the Boost file, if it doesn't exist
                if (!fs.existsSync(boostFile.fsPath)) {
                    if (
                        !(await this.loadCurrentFile(uri, context)) ||
                        !fs.existsSync(boostFile.fsPath)
                    ) {
                        boostLogging.warn(
                            `Unable to open Boost Notebook for file:[${uri.fsPath}]; check the Polyverse Boost Output channel for details`
                        );
                        return;
                    }
                }
                const boostDoc = await vscode.workspace.openNotebookDocument(
                    boostFile
                );
                vscode.window.showNotebookDocument(boostDoc);
            }
        ));

        context.subscriptions.push(vscode.commands.registerCommand(
            boostnb.NOTEBOOK_TYPE + "." + BoostCommands.processCurrentFile,
            async (
                uri: vscode.Uri,
                kernelCommand?: string,
                forceAnalysisRefresh: boolean = false
            ) => {
                const likelyViaUI =
                    !kernelCommand || typeof kernelCommand !== "string";
                if (likelyViaUI) {
                    kernelCommand = BoostConfiguration.currentKernelCommand;
                }

                await this.waitForActivationToFinish();

                return await this.processCurrentFile(
                    uri,
                    kernelCommand as string,
                    context,
                    forceAnalysisRefresh
                ).catch((error) => {
                    boostLogging.error(errorToString(error), likelyViaUI);
                });
            }
        ));

        context.subscriptions.push(vscode.commands.registerCommand(
            boostnb.NOTEBOOK_TYPE + "." + BoostCommands.loadSummaryFile,
            async (uri: vscode.Uri) => {
                await this.waitForActivationToFinish();

                const boostSummaryFile = getBoostFile(uri, {
                    format: BoostFileType.summary,
                });
                // create the Boost file, if it doesn't exist
                if (!fs.existsSync(boostSummaryFile.fsPath)) {
                    if (
                        !(await this.loadCurrentFile(boostSummaryFile, context)) ||
                        !fs.existsSync(boostSummaryFile.fsPath)
                    ) {
                        boostLogging.warn(
                            `Unable to open Boost Summary Notebook for file:[${uri.fsPath}]; check the Polyverse Boost Output channel for details`,
                            true
                        );
                        return;
                    }
                }
                const boostDoc = await vscode.workspace.openNotebookDocument(
                    boostSummaryFile
                );
                vscode.window.showNotebookDocument(boostDoc);
            }
        ));

        context.subscriptions.push(vscode.commands.registerCommand(
            boostnb.NOTEBOOK_TYPE + "." + BoostCommands.processAllFilesInRings,
            async (
                options: { analysisTypes?: string[], fileLimit?: number, showUI?: boolean } | undefined) => {

                this.getBoostProjectData()!.startBatchJob();
                this.summary?.refresh(true);
                try{
                    
                    await this.waitForActivationToFinish();

                    return await this.processAllFilesInRings(options);
                } catch (error) {
                    boostLogging.error(errorToString(error), options?.showUI);
                } finally {
                    // make sure we always restore the analysis state to quiescent after finishing analysis
                    this.getBoostProjectData()!.finishBatchJob();
                    this.summary?.refresh(true);
                }
            }
        ));

        context.subscriptions.push(vscode.commands.registerCommand(
            boostnb.NOTEBOOK_TYPE + "." + BoostCommands.cancelGlobalAnalysis,
            async (options: { showUI?: boolean } | undefined) => {
                try {
                    await this.cancelGlobalAnalysis({ showUI: options?.showUI } as ProcessRingsOptions);
                } catch (error) {
                    boostLogging.error(errorToString(error), options?.showUI);
                } finally {
                    // make sure we always restore the analysis state to quiescent after finishing analysis
                    this.getBoostProjectData()!.finishBatchJob();
                    this.summary?.refresh(true);
                }
            }
        ));
    }

    readonly ringSummaryAnalysisMap = new Map([
        [
            BoostUserAnalysisType.documentation,
            [
            ],
        ],
        [
            BoostUserAnalysisType.security,
            [
                getKernelName(quickSecuritySummaryKernelName),
                getKernelName(quickPerformanceSummaryKernelName),
            ],
        ],
        [
            BoostUserAnalysisType.compliance,
            [
                getKernelName(quickComplianceSummaryKernelName),
            ],
        ],
    ]);

    readonly ringFileAnalysisMap = new Map([
        [
            BoostUserAnalysisType.documentation,
            [
                getKernelName(explainKernelName),
                getKernelName(flowDiagramKernelName),
            ],
        ],
        [
            BoostUserAnalysisType.security,
            [
                getKernelName(analyzeFunctionKernelName),
                getKernelName(quickSecuritySummaryKernelName),
                getKernelName(performanceFunctionKernelName),
                getKernelName(quickPerformanceSummaryKernelName),
            ],
        ],
        [
            BoostUserAnalysisType.compliance,
            [
                getKernelName(complianceFunctionKernelName),
                getKernelName(quickComplianceSummaryKernelName),
            ],
        ],
        [
            BoostUserAnalysisType.deepCode,
            [
                getKernelName(analyzeKernelName),
                getKernelName(complianceKernelName),
                getKernelName(performanceKernelName),
                getKernelName(codeGuidelinesKernelName),
                getKernelName(performanceKernelName),
            ],
        ],
    ]);

    readonly ringFileAnalysisOutputMap = new Map([
        [
            BoostUserAnalysisType.documentation,
            [
                ControllerOutputType.explain,
                ControllerOutputType.flowDiagram,
            ],
        ],
        [
            BoostUserAnalysisType.security,
            [
                ControllerOutputType.analyzeFunction,
                ControllerOutputType.performanceFunction,
            ],
        ],
        [
            BoostUserAnalysisType.compliance,
            [
                ControllerOutputType.complianceFunction,
            ],
        ],
        [
            BoostUserAnalysisType.deepCode,
            [
                ControllerOutputType.analyze,
                ControllerOutputType.compliance,
                ControllerOutputType.performance,
                ControllerOutputType.codeGuidelines,
                ControllerOutputType.performance
            ],
        ],
    ]);     

    checkAccountEnabledBeforeContinuingAnalysis() {
        const projectData = this.getBoostProjectData();
        if (!projectData) {
            throw new WorkflowError("abort", "Aborting analysis - Unable to determine current account status.");
        }
        const processingEnabled = projectData.account.enabled;
        if (!processingEnabled) {
            throw new WorkflowError("abort", `Account is ${projectData.account.status?projectData.account.status:"unknown status"} and cannot perform analysis. Please update your account in the Account Dashboard.`);
        }
    }

    cancelGlobalAnalysis(options?: ProcessRingsOptions) {
        if (this.activeWorkflowEngine.size === 0) {
            const warning = "Unable to cancel global analysis; no analysis is currently running";
            boostLogging.warn(warning, options?.showUI);
            return;
        }
        boostLogging.debug("Cancelling global analysis");

        this.activeWorkflowEngine.values()?.next()?.value.cancel();

        this.getBoostProjectData()!.cancelBatchJob();
        this.summary?.refresh(true);
    }

    async processAllFilesInRings(options?: ProcessRingsOptions) {
        const tasks : any[] = [];

        // check current account status before even starting
        this.checkAccountEnabledBeforeContinuingAnalysis();

        let requestedFileCount : number = options?.fileLimit ?? 0;
        let refreshedFileCounter = 0;
        let hardFileLimit = 0;
        if (options?.fileLimit === undefined) {
            const rawAnalysisMode : string = this.getBoostProjectData()?.uiState?.activityBarState?.summaryViewState?.analysisMode ?? "";
            switch (rawAnalysisMode) {
                case "analyze-all-mode":
                    requestedFileCount = 0;
                    break;
                case "process-next-1":
                    requestedFileCount = 0;
                    hardFileLimit = 1;
                    break;
                case "process-next-5":
                    requestedFileCount = 0;
                    hardFileLimit = 5;
                    break;
                case "top5-mode":
                default:
                    requestedFileCount = 5;
                    hardFileLimit = 5;
                    break;
            }
        }

        let analysisTypes : string[] = options?.analysisTypes ?? [];
        if (!(analysisTypes && analysisTypes.length)) {
            const rawAnalysisTypes = this.getBoostProjectData()?.uiState?.activityBarState?.summaryViewState?.analysisTypesState ?? [];
            if (rawAnalysisTypes) {
                // Extract the keys where the value is true
                analysisTypes = Object.entries(rawAnalysisTypes)
                                     .filter(([_, value]) => value)
                                     .map(([key, _]) => key);
            }
        }

        const workflowName = "Run Selected Analysis";

        // we're going to dynamically build the list at the start of the run
        //      so we get the best most up to date list of files from
        //      blueprint
        const prepareFileList = async () => {
            // get the entire list of files to analyze
            const allFiles = await getAllProjectFiles( { debugFileCounts: true, enforceFileLimit: true });
            boostLogging.info(`Total Project is ${allFiles.length} files`);
    
            // get the requested # of files only
            const limitedFiles = (requestedFileCount !== 0)?allFiles.slice(0, requestedFileCount):allFiles;
            if (requestedFileCount !== 0) {
                boostLogging.info(`Processing only ${limitedFiles.length} files by request`);
            }

            // compute the ControllerOutputTypes for the analysisTypes by looking at the ringSummaryAnalysisMap
            //    with the analysisTypes, turn into an array. the map returns an array of contollers, we
            //    get the outputtype with controller.outputType

            const controllerOutputTypes = analysisTypes.map((analysisType) => {
                const outputTypes = this.ringFileAnalysisOutputMap.get(analysisType as BoostUserAnalysisType);
                if (outputTypes) {
                    return outputTypes.map((outputType) => {
                        return outputType as ControllerOutputType;
                    });
                } else {
                    return [];
                }
            }).flat();

            // log the relative path for simplicity for user
            const rootPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath as string;

            const relFiles : string[] = [];

            limitedFiles.forEach((file) => {
                const relativePath = path.relative(rootPath, file);
                relFiles.push(relativePath);
                tasks.push(
                    () => {

                        const fileDynamicFunc = async () => { // use arrow function
                            const fileAnalysisTasks : any[] = [];

                            const fileAnalysisWorkflowName = `${workflowName}-File ${relativePath}`;
                            for (const [key, value] of this.ringFileAnalysisMap) {
                                fileAnalysisTasks.push(
                                    () => {
                                        const analysisTypeDynamicFunc = async () => {
                                            if (!analysisTypes.includes(key)) {
                                                throw new WorkflowError("skip", `Skipping File ${key} Analysis by user request`);
                                            } else if (hardFileLimit > 0 && refreshedFileCounter >= hardFileLimit) {

                                                // if the user requested processing a limit of # files, then we asked for all files to refresh
                                                //      but we stop processing once # files have actually refreshed
                                                throw new WorkflowError("skip", `Skipping File ${key} Analysis because we've reached the file limit`);
                                            }
                                            const fileUri = vscode.Uri.file(file);
                                            const areaAnalysisWorkflowName = `${fileAnalysisWorkflowName}-${key}`;
                                            const processedFile : boolean = await this.processDepthOnRingFileTask(fileUri, value, areaAnalysisWorkflowName);
                                            return processedFile;
                                        };
                                        
                                        // Name the function dynamically based on the key
                                        Object.defineProperty(analysisTypeDynamicFunc, 'name', { value: key, writable: false });
                                        
                                        return analysisTypeDynamicFunc;
                                    }
                                );
                            }

                            const fileAnalysisEngine = new WorkflowEngine(fileAnalysisTasks, {
                                pattern: [1],
                                logger: boostLogging,
                                name: fileAnalysisWorkflowName,
                            });

                            const fileAnalysisResults = await fileAnalysisEngine.run();
                            const completed = fileAnalysisResults.filter((x) => x[0] !== undefined && !(x[0] instanceof Error));
                            const skipped = fileAnalysisResults.filter((x) => x[0] && x[0] instanceof WorkflowError && (x[0] as WorkflowError).type === "skip");
                            const aborted = fileAnalysisResults.filter((x) => x && x[0] instanceof WorkflowError && (x[0] as WorkflowError).type === "abort");
                            const canceled = fileAnalysisResults.filter((x) => x && x[0] instanceof WorkflowError && (x[0] as WorkflowError).type === "cancel");
                            const errors = fileAnalysisResults.filter((x) => x && x[0] instanceof Error && !(x[0] instanceof WorkflowError));

                            boostLogging.info(`${relativePath} Analysis completed: ${totalElements(completed)}`);
                            boostLogging.info(`${relativePath} Analysis skipped: ${totalElements(skipped)}`);
                            boostLogging.info(`${relativePath} Analysis aborted: ${totalElements(aborted)}`);
                            boostLogging.info(`${relativePath} Analysis canceled: ${totalElements(canceled)}`);
                            boostLogging.info(`${relativePath} Analysis errors: ${totalElements(errors)}`);

                            if (errors.length > 0) {
                                throw errors[0];
                            }

                            if (aborted.length > 0) {
                                throw aborted[0];
                            }
                            if (canceled.length > 0) {
                                throw canceled[0];
                            }
                            if (completed.length === 0 && skipped.length > 0) {
                                throw new WorkflowError("skip", `Skipping File ${relativePath} Analysis because all analysis types were skipped`);
                            }

                            // if the file was updated 
                            const fileRefreshed = completed.some((x) => x[0]);
                            if (fileRefreshed) {
                                refreshedFileCounter++;
                                return file;
                            } else {
                                throw new WorkflowError("skip", `Skipping File ${relativePath} Analysis because no analysis types were refreshed`);
                            }
                        };
                        
                        // Name the function dynamically based on the file (to improve logging)
                        Object.defineProperty(fileDynamicFunc, 'name', { value: relativePath, writable: false });
                        
                        return fileDynamicFunc;
                    }
                );
            });

            this.getBoostProjectData()!.addQueue(controllerOutputTypes, relFiles);
            this.summary?.refresh();
        };
 
        const beforeRun = [
            () => async () => {
                // refresh ignore targets - to ensure we don't analyze files that should be ignored
                await createDefaultBoostIgnoreFile();
                
                if (BoostConfiguration.simulateServiceCalls) {
                    boostLogging.debug(`Simulate:executeCommand: processProject(${getKernelName(quickBlueprintKernelName)})`);
                } else {
                    this.checkAccountEnabledBeforeContinuingAnalysis();
                    // we want to run blueprint first so we get the excludes and priority list before
                    //   we build the task list for the file rings
                    await vscode.commands.executeCommand(
                        boostnb.NOTEBOOK_TYPE +
                        "." +
                        BoostCommands.processProject,
                        getKernelName(quickBlueprintKernelName)
                    );

                    this.checkAccountEnabledBeforeContinuingAnalysis();

                    // since we've added Boost analysis to the project,
                    //      let's ensure that future opens of the project source
                    //      can use Boost if user approves install
                    addBoostToProjectExtensions();
                }

                if (BoostConfiguration.projectCleanupMethod) {
                    // clean up any previous analysis
                    await vscode.commands.executeCommand(
                        boostnb.NOTEBOOK_TYPE + "." + BoostCommands.cleanBoostFiles
                    );
                } else {
                    boostLogging.info(`Skipping cleanup of unneeded analysis files - per Configuration Setting`);
                }

                await prepareFileList();

                if (BoostConfiguration.simulateServiceCalls) {
                    boostLogging.debug(`Simulate:executeCommand: loadCurrentFolder()`);
                    boostLogging.debug(`Simulate:executeCommand: refreshProjectData()`);
                } else {

                    // creates and loads/refreshes/rebuilds all notebook files
                    await vscode.commands.executeCommand(
                        boostnb.NOTEBOOK_TYPE + "." + BoostCommands.loadCurrentFolder,
                        undefined
                    );
                    // refresh project data (since we may have rebuilt source/files)
                    return vscode.commands.executeCommand(
                        boostnb.NOTEBOOK_TYPE + "." + BoostCommands.refreshProjectData
                    );
                }
            },
        ];

        const afterEachTask = [
            () => async (inputs: any[]) => {
                const path = inputs[0]; // first param is the file path

                // refresh output files for the analysis on this file
                if (BoostConfiguration.simulateServiceCalls) {
                    boostLogging.debug(`Simulate:executeCommand: buildCurrentFileOutput`);
                } else {
                    await vscode.commands.executeCommand(
                        boostnb.NOTEBOOK_TYPE + "." + BoostCommands.buildCurrentFileOutput,
                        vscode.Uri.file(path),
                        "all" // build all outputs for this file
                    );
                }

                if (!BoostConfiguration.alwaysRunSummary) {
                    boostLogging.info(`Skipping summary for source file: ${path}`);
                    return;
                }

                if (BoostConfiguration.simulateServiceCalls) {
                    boostLogging.debug(`Simulate:executeCommand: processCurrentFolder(${path}, ${getKernelName(summarizeKernelName)})`);
                } else {
                    // build the summary notebook for this file
                    await vscode.commands.executeCommand(
                        boostnb.NOTEBOOK_TYPE + "." + BoostCommands.processCurrentFolder,
                        vscode.Uri.file(path),
                        getKernelName(summarizeKernelName)
                    );
                    this.checkAccountEnabledBeforeContinuingAnalysis();
                }

                // refresh output files for the analysis summary on this file
                if (BoostConfiguration.simulateServiceCalls) {
                    boostLogging.debug(`Simulate:executeCommand: buildCurrentFileSummaryOutput`);
                } else {
                    await vscode.commands.executeCommand(
                        boostnb.NOTEBOOK_TYPE + "." + BoostCommands.buildCurrentFileSummaryOutput,
                        vscode.Uri.file(path),
                        "all" // build all outputs for this file
                    );
                }
            },
        ];
        const afterEachTaskGroup = [
            () => async () => {
                const afterRingSummaryRun = [
                    () => async () => {
                        if (BoostConfiguration.simulateServiceCalls) {
                            boostLogging.debug(`Simulate:executeCommand: refreshProjectData()`);
                        } else {
                            // refresh project data
                            return vscode.commands.executeCommand(
                                boostnb.NOTEBOOK_TYPE + "." + BoostCommands.refreshProjectData
                            );
                        }
                    },
                ];

                const summaryTasks : any[] = [];

                const summaryWorkflowName = `${workflowName}-Summarization`;
                for (const [key, value] of this.ringSummaryAnalysisMap) {
                    summaryTasks.push(
                        () => {
                            const dynamicFunc = async () => {
                                if (!analysisTypes.includes(key)) {
                                    throw new WorkflowError("skip", `Skipping Summary Analysis ${key} by user request`);
                                }
                                const result = this.processQuickSummaryOfRingFileTaskGroup(value);
                                return false; // we ignore the result - since this doesn't change the file processing itself
                            };
                            
                            // Name the function dynamically based on the key
                            Object.defineProperty(dynamicFunc, 'name', { value: key, writable: false });
                            
                            return dynamicFunc;
                        }
                    );
                }
                
                const summaryEngine = new WorkflowEngine(summaryTasks, {
                    afterRun: afterRingSummaryRun,
                    pattern: [1],
                    logger: boostLogging,
                    name: summaryWorkflowName,
                });

                const summaryResults = await summaryEngine.run();
                const completed = summaryResults.filter((x) => x[0] !== undefined && !(x[0] instanceof Error));
                const skipped = summaryResults.filter((x) => x[0] && x[0] instanceof WorkflowError && (x[0] as WorkflowError).type === "skip");
                const aborted = summaryResults.filter((x) => x[0] && x[0] instanceof WorkflowError && (x[0] as WorkflowError).type === "abort");
                const canceled = summaryResults.filter((x) => x[0] && x[0] instanceof WorkflowError && (x[0] as WorkflowError).type === "cancel");
                const errors = summaryResults.filter((x) => x[0] && x[0] instanceof Error && !(x[0] instanceof WorkflowError));
                boostLogging.info(`Workflow Analysis Summaries completed: ${totalElements(completed)}`);
                boostLogging.info(`Workflow Analysis Summaries skipped: ${totalElements(skipped)}`);
                boostLogging.info(`Workflow Analysis Summaries aborted: ${totalElements(aborted)}`);
                boostLogging.info(`Workflow Analysis Summaries canceled: ${totalElements(canceled)}`);
                boostLogging.info(`Workflow Analysis Summaries errors: ${totalElements(errors)}`);

                if (errors.length > 0) {
                    throw errors[0];
                }
                if (aborted.length > 0) {
                    throw aborted[0];
                }
                if (canceled.length > 0) {
                    throw canceled[0];
                }
                if (completed.length === 0 && skipped.length > 0) {
                    throw new WorkflowError("skip", `Skipping Workflow Analysis Summaries because all analysis types were skipped`);
                }

                // return true if any of the results did work, else false
                return completed.some((x) => x[0]);
            },
        ];
        const afterRun = [
            () => async () => {
                if (BoostConfiguration.simulateServiceCalls) {
                    boostLogging.debug(`Simulate:executeCommand: refreshProjectData()`);
                } else {
                    // refresh project data, refresh the UI
                    await vscode.commands.executeCommand(
                        boostnb.NOTEBOOK_TYPE + "." + BoostCommands.refreshProjectData
                    );
                }

                // refresh summary output at the end of the run
                if (BoostConfiguration.simulateServiceCalls) {
                    boostLogging.debug(`Simulate:executeCommand: buildCurrentFolderSummaryOutput`);
                } else {
                    await vscode.commands.executeCommand(
                        boostnb.NOTEBOOK_TYPE + "." + BoostCommands.buildCurrentFolderSummaryOutput,
                        undefined,
                        "all" // build all summary outputs for the entire project
                    );
                }
            },
        ];

        // if we're doing a targeted limit, then process 1 sample then small batch at a time
        // if we have no limit, then double ring size each iteration
        const pattern = (requestedFileCount === 0)?
            [1, 2, 4, 8, 16]    // infinite limit, doubling in size each ring
            :[1, 4];            // limited (sample), 1 sample then 4 at a time

        if (this.activeWorkflowEngine.size > 0) {
            const error = `Active Global Analysis Workflow detected - ${this.activeWorkflowEngine.keys().next().value}. Please cancel current Analysis Workflow or wait for it to finish before starting a new global analysis`;
            boostLogging.error(error, options?.showUI);
            throw new Error(error);
        }

        const globalWorkflowName = `${workflowName} ${options?.showUI?`(Activity Bar launched)`:`(Background Silent)`} started  at ${new Date().toLocaleTimeString()}`;
        const globalWorkflowEngine = new WorkflowEngine(tasks, {
            beforeRun: beforeRun,
            afterEachTask: afterEachTask,
            afterEachTaskGroup: afterEachTaskGroup,
            afterRun: afterRun,
            pattern: pattern,
            logger: boostLogging,
            name: workflowName,
        });
        this.activeWorkflowEngine.set(globalWorkflowName, globalWorkflowEngine);

        try {
            const allResults = (await globalWorkflowEngine.run()).flat();
            const completed = allResults.filter((x) => x !== undefined && !(x instanceof Error));
            const skipped = allResults.filter((x) => x && x instanceof WorkflowError && (x as WorkflowError).type === "skip");
            const aborted = allResults.filter((x) => x && x instanceof WorkflowError && (x as WorkflowError).type === "abort");
            const canceled = allResults.filter((x) => x && x instanceof WorkflowError && (x as WorkflowError).type === "cancel");
            const errors = allResults.filter((x) => x && x instanceof Error && !(x instanceof WorkflowError));

            boostLogging.info(`Overall Workflow File Analysis completed: ${completed.length}`);
            boostLogging.info(`Overall Workflow File Analysis skipped: ${skipped.length}`);

            // we focus on errors first since those are likely the fatal cause of analysis ending
            try {
                if (errors.length > 0) {
                    throw errors;
                }
                if (aborted.length > 0) {
                    throw aborted;
                }
                if (canceled.length > 0) {
                    throw canceled;
                }
            } finally {
                // print the list of files we actually updated
                boostLogging.info(`Overall Workflow Analysis Files Updated:`);
                if (completed.length > 0) {
                    completed.forEach((x) => {
                        boostLogging.info(`\t${vscode.workspace.asRelativePath(x)}`);
                    });
                } else {
                    boostLogging.info(`\tNone`);
                }
            }
            // return list of files updated
            return completed;
        } finally {
            // clear active global workflow
            this.activeWorkflowEngine.clear();

            this.getBoostProjectData()!.finishBatchJob();
            this.summary?.refresh(true);
        }
    }

    readonly activeWorkflowEngine : Map<string, WorkflowEngine> = new Map();

    private async processDepthOnRingFileTask(
        fileUri: vscode.Uri,
        value: string[],
        workflowName: string): Promise<boolean> {
        // log the relative path for simplicity for user
        const rootPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath as string;
        const relativePath = path.relative(rootPath, fileUri.fsPath);

        const analysisTypeKernelTasks : any[] = [];
        
        for (const analysisKernelName of value) {
            analysisTypeKernelTasks.push(
                () => {
                    const dynamicFunc = async () => {
                        if (this.activeWorkflowEngine.values().next().value?.canceled) {
                            throw new WorkflowError("cancel", `Analysis for ${relativePath} was canceled`);
                        }
                        /* we're going to let the actual controller simulate the service calls to get maximim code coverage
                        if (BoostConfiguration.simulateServiceCalls) {
                            boostLogging.debug(`Simulate:executeCommand: processCurrentFolder(${fileUri}, ${analysisKernelName})`);

                            // wait before continuing to simulate delay in processing
                            await (new Promise(resolve => setTimeout(resolve, 100)));
                            return true; // simulate work happened
                        }
                        */
                        this.checkAccountEnabledBeforeContinuingAnalysis();
                        const refreshed = await vscode.commands.executeCommand(
                            boostnb.NOTEBOOK_TYPE +
                            "." +
                            BoostCommands.processCurrentFolder,
                            {
                                kernelCommand: analysisKernelName,
                                filelist: [fileUri],
                            } as ProcessCurrentFolderOptions
                        );
                        this.checkAccountEnabledBeforeContinuingAnalysis();
                        if (!refreshed) {
                            throw new WorkflowError("skip", `Analysis for ${relativePath} was skipped - all analyzable content was already up to date`);
                        }
                        // return if we did actual work (or think we did work)
                        return refreshed as boolean;
                    };
                    
                    // Name the function dynamically
                    Object.defineProperty(dynamicFunc, 'name', { value: `${relativePath}:${analysisKernelName}`, writable: false });
                    
                    return dynamicFunc;
                }
            );
        }
        
        const fileAnalysisEngine = new WorkflowEngine(analysisTypeKernelTasks, {
            pattern: [1],
            logger: boostLogging,
            name: workflowName,
        });

        const analysisTypeResults = await fileAnalysisEngine.run();
        const completed = analysisTypeResults.filter((x) => x[0] !== undefined && !(x[0] instanceof Error));
        const skipped = analysisTypeResults.filter((x) => x[0] && x[0] instanceof WorkflowError && (x[0] as WorkflowError).type === "skip");
        const aborted = analysisTypeResults.filter((x) => x[0] && x[0] instanceof WorkflowError && (x[0] as WorkflowError).type === "abort");
        const canceled = analysisTypeResults.filter((x) => x[0] && x[0] instanceof WorkflowError && (x[0] as WorkflowError).type === "cancel");
        const errors = analysisTypeResults.filter((x) => x[0] && x[0] instanceof Error && !(x[0] instanceof WorkflowError));
        boostLogging.info(`${relativePath} Analysis Kernels completed: ${totalElements(completed)}`);
        boostLogging.info(`${relativePath} Analysis Kernels skipped: ${totalElements(skipped)}`);
        boostLogging.info(`${relativePath} Analysis Kernels aborted: ${totalElements(aborted)}`);
        boostLogging.info(`${relativePath} Analysis Kernels canceled: ${totalElements(canceled)}`);
        boostLogging.info(`${relativePath} Analysis Kernels errored: ${totalElements(errors)}`);

        if (errors.length > 0) {
            throw errors[0];
        }
        if (aborted.length > 0) {
            throw aborted[0];
        }
        if (canceled.length > 0) {
            throw canceled[0];
        }
        if (completed.length === 0 && skipped.length > 0) {
            throw new WorkflowError("skip", `Skipping Analysis Kernels because all analysis types were skipped`);
        }

        // we'll assume completed is an array of boolean values (since we filtered out errors)
        //      but we need to return a single true (if any of the completed items are true and did work)
        //      or false if all completed items are false
        return completed.some((x) => x[0]);
    }

    private async processQuickSummaryOfRingFileTaskGroup(value: string[]) {
        for (const analysisKernelName of value) {
            if (BoostConfiguration.simulateServiceCalls) {
                boostLogging.debug(`Simulate:executeCommand: processProject(${analysisKernelName})`);
                continue;
            }
            this.checkAccountEnabledBeforeContinuingAnalysis();
            await vscode.commands.executeCommand(
                boostnb.NOTEBOOK_TYPE +
                "." +
                BoostCommands.processProject,
                analysisKernelName
            );
            this.checkAccountEnabledBeforeContinuingAnalysis();
        }
    }

    async buildCurrentFileOutput(
        uri: vscode.Uri,
        summary: boolean,
        outputFormat: string,
        context: vscode.ExtensionContext
    ): Promise<string> {
        return new Promise<string>(async (resolve, reject) => {
            try {
                // if we don't have a file selected, and asking for single file analysis, then fail
                //  we only report summaries for folders
                if (uri === undefined) {
                    if (!summary) {
                        boostLogging.warn(
                            `Unable to identify an active file to build ${this.kernelCommand}`
                        );
                        reject(new Error("No active file found"));
                        return;
                    } else if (!vscode.workspace.workspaceFolders) {
                        boostLogging.error(
                            `Cannot build summary without a Workspace or Project loaded`
                        );
                        reject(
                            new Error(
                                "Cannot build summary without a Workspace or Project loaded"
                            )
                        );
                        return;
                    }

                    uri = vscode.workspace.workspaceFolders[0].uri;
                }

                const baseWorkspacePath =
                    vscode.workspace.workspaceFolders![0].uri.fsPath;

                let boostUri = uri;
                // if we got a source file, then load the notebook from it
                if (!uri.fsPath.endsWith(boostnb.NOTEBOOK_EXTENSION)) {
                    if (summary) {
                        boostUri = getBoostFile(uri, {
                            format: BoostFileType.summary,
                        });
                    } else {
                        boostUri = getBoostFile(uri);
                    }
                }

                if (!fs.existsSync(boostUri.fsPath)) {
                    const relativePath = path.relative(
                        baseWorkspacePath,
                        uri.fsPath
                    );
                    reject(
                        new Error(
                            `Unable to find Boost notebook for ${
                                relativePath.startsWith("../")
                                    ? uri.fsPath
                                    : relativePath
                            } - please create Boost notebook first`
                        )
                    );
                    return;
                }

                // if user didn't specify output format, then we'll use configuration
                if (!outputFormat) {
                    outputFormat = BoostConfiguration.defaultOutputFormat;
                }
                switch (outputFormat.toLowerCase()) {
                    case "all":
                        try {
                            const markdownFile =
                                await generateMarkdownforNotebook(
                                    boostUri.fsPath,
                                    baseWorkspacePath
                                );
                            const htmlFile = await generateHTMLforNotebook(
                                boostUri.fsPath,
                                baseWorkspacePath,
                                context
                            );
                            const pdfFile = await generatePDFforNotebook(
                                boostUri.fsPath,
                                baseWorkspacePath,
                                context
                            );
                            // since we're generating all 3, we're only going to report the last one
                            resolve(pdfFile);
                        } catch (error) {
                            reject(error);
                        }
                        break;
                    case "html":
                        try {
                            const htmlFile = generateHTMLforNotebook(
                                boostUri.fsPath,
                                baseWorkspacePath,
                                context
                            );
                            resolve(htmlFile);
                        } catch (error) {
                            reject(error);
                        }
                        break;
                    case "pdf":
                        try {
                            const pdfFile = generatePDFforNotebook(
                                boostUri.fsPath,
                                baseWorkspacePath,
                                context
                            );
                            resolve(pdfFile);
                        } catch (error) {
                            reject(error);
                        }
                        break;
                    case "markdown":
                        try {
                            const markdownFile = generateMarkdownforNotebook(
                                boostUri.fsPath,
                                baseWorkspacePath
                            );
                            resolve(markdownFile);
                        } catch (error) {
                            reject(error);
                        }
                        break;
                    default:
                        reject(
                            new Error(
                                `Unsupported output format ${outputFormat} - please use html, pdf, or markdown`
                            )
                        );
                }
            } catch (error) {
                reject(error);
            }
        });
    }

    async buildCurrentFolderOutput(
        folderUri: vscode.Uri,
        outputFormat: string,
        context: vscode.ExtensionContext
    ) {
        let targetFolder: vscode.Uri;
        // if we don't have a folder selected, then the user didn't right click
        //      so we need to use the workspace folder
        if (folderUri === undefined) {
            if (vscode.workspace.workspaceFolders === undefined) {
                boostLogging.warn(
                    "Unable to find Workspace Folder. Please open a Project or Folder first"
                );
                return;
            }

            // use first folder in workspace
            targetFolder = vscode.workspace.workspaceFolders[0].uri;
            boostLogging.debug(
                `Analyzing Project Wide Boost files in Workspace: ${targetFolder.fsPath}`
            );
        } else {
            targetFolder = folderUri;
            boostLogging.debug(
                `Analyzing Boost files in folder: ${folderUri.fsPath}`
            );
        }

        let baseWorkspace: vscode.Uri;
        if (vscode.workspace.workspaceFolders) {
            baseWorkspace = vscode.workspace.workspaceFolders![0].uri;
        } else {
            baseWorkspace = folderUri;
        }

        // get all the source files we're going to convert to output
        const sourceFiles = await getAllProjectFiles( { targetFolder: folderUri, enforceFileLimit: false });
        const notebookFilesThatExist = sourceFiles.filter((file) => {
            if (!fs.existsSync(file)) {
                boostLogging.debug(
                    `Skipping missing Boost Notebook file: ${file} for expected source`
                );
                return false;
            }
            const boostFile = getBoostFile(vscode.Uri.file(file));
            return fs.existsSync(boostFile.fsPath);
        });

        boostLogging.debug(
            "Converting " +
                notebookFilesThatExist.length +
                " files in folder: " +
                targetFolder
        );

        try {
            let convertedNotebookWaits: any[] = [];

            notebookFilesThatExist.forEach((file: string) => {
                convertedNotebookWaits.push(
                    this.buildCurrentFileOutput(
                        vscode.Uri.file(file),
                        false,
                        outputFormat,
                        context
                    )
                );
            });

            await Promise.all(convertedNotebookWaits)
                .then((convertedNotebooks) => {
                    convertedNotebooks.forEach((convertedPdf: string) => {
                        // we let user know the notebook was processed
                        boostLogging.info(
                            `Boost Notebook converted ${convertedPdf}`,
                            false
                        );
                    });
                    boostLogging.info(
                        `${convertedNotebookWaits.length.toString()} Boost Notebooks converted for folder ${
                            targetFolder.fsPath
                        }`,
                        false
                    );
                })
                .catch((error) => {
                    // Handle the error here
                    boostLogging.error(
                        `Error converting Notebooks in folder ${
                            targetFolder.fsPath
                        } due to Error: ${errorToString(error)}`
                    );
                });
        } catch (error) {
            boostLogging.error(
                `Unable to Convert Notebooks in Folder:[${folderUri.fsPath.toString()} due to error:${errorToString(
                    error
                )}`
            );
        }
    }

    getProductDocumentation() {
        if (this?.summary?.visible) {
            return instructions.markdown;
        } else {
            return "";
        }
    }

    public getBackgroundContext(
        commandId?: string
    ): analysis.IAnalysisContextData[] {
        const analysisContext: any[] = [];

        // always get blueprint
        const targetAnalysisSummaries: BoostUserAnalysisType[] = [
            BoostUserAnalysisType.blueprint,
        ];

        if (!commandId) {
            commandId = "";
        }

        switch (commandId) {
            // compliance query
            case complianceFunctionKernelName:
            case complianceKernelName:
                targetAnalysisSummaries.push(BoostUserAnalysisType.compliance);
                break;

            // if a security query - add security context
            case analyzeFunctionKernelName:
            case analyzeKernelName:
            case performanceKernelName:
            case performanceFunctionKernelName:
                targetAnalysisSummaries.push(BoostUserAnalysisType.security);
                break;

            // if a quick analysis query - leave out all summary context
            case quickBlueprintKernelName:
            case quickComplianceSummaryKernelName:
            case quickSecuritySummaryKernelName:
            case quickPerformanceSummaryKernelName:
                // target nothing but the blueprint
                break;

            // for chat and custom queries add all summary context
            case chatKernelName:
            case customProcessKernelName:
                const advancedChat = BoostConfiguration.advancedChat;

                targetAnalysisSummaries.push(BoostUserAnalysisType.compliance);
                targetAnalysisSummaries.push(BoostUserAnalysisType.security);

                if (!advancedChat) {
                    break;
                }

                // grab all the active tab filenames
                const activeTabFiles = this.getActiveTabFilenames();
                if (activeTabFiles.length > 0) {
                    boostLogging.debug(
                        `User Context(${analysis.AnalysisContextType.userFocus}):ActiveTabFilenames(primary):${activeTabFiles[0]}`
                    );
                    // send the active tab to userFocus
                    analysisContext.push({
                        type: analysis.AnalysisContextType.userFocus,
                        data: `I am currently looking at file: ${activeTabFiles[0]}`,
                        name: "visibleActiveTab",
                    });
                } else {
                    boostLogging.debug(
                        `User Context(${analysis.AnalysisContextType.userFocus}):ActiveTabFilenames(primary):SKIPPED`
                    );
                }

                // get context for current code
                const activeNotebookText =
                    this.getActiveNotebookSurroundingLines();
                if (activeNotebookText.length > 0) {
                    boostLogging.debug(
                        `User Context(${analysis.AnalysisContextType.userFocus}):ActiveNotebook:${activeNotebookText.length} lines`
                    );
                    analysisContext.push({
                        type: analysis.AnalysisContextType.userFocus,
                        data: `I am currently focused on this notebook \n\n\`\`\`${activeNotebookText.join(
                            "\n\t"
                        )}\`\`\``,
                        name: "activeNotebook",
                    });
                } else {
                    const activeEditorText =
                        this.getActiveEditorSurroundingLines();
                    if (activeEditorText.length > 0) {
                        boostLogging.debug(
                            `User Context(${analysis.AnalysisContextType.userFocus}):ActiveEditorText:${activeEditorText.length} lines`
                        );
                        analysisContext.push({
                            type: analysis.AnalysisContextType.userFocus,
                            data: `I am currently focused on this text in my source code editor\n\n\`\`\`${activeEditorText.join(
                                "\n\t"
                            )}\`\`\``,
                            name: "activeEditor",
                        });
                    } else {
                        boostLogging.debug(
                            `User Context(${analysis.AnalysisContextType.userFocus}):ActiveNotebook:SKIPPED`
                        );
                    }
                }

                // get related analysis for the current tab source code (if its raw source)
                //      otherwise, we'll pull the summary or notebook in userFocus
                const activeSourceTabDetailedAnalysis: analysis.IAnalysisContextData[] =
                    this.getDetailedAnalysisForCurrentTabSelection(
                        targetAnalysisSummaries,
                        analysis.AnalysisContextType.related
                    );
                if (activeSourceTabDetailedAnalysis.length > 0) {
                    boostLogging.debug(
                        `User Context(${analysis.AnalysisContextType.related}):ActiveTabSourceDetailedAnalysis:${activeSourceTabDetailedAnalysis.length} types`
                    );

                    analysisContext.push(...activeSourceTabDetailedAnalysis);
                } else {
                    boostLogging.debug(
                        `User Context(${analysis.AnalysisContextType.related}):ActiveTabSourceDetailedAnalysis:SKIPPED`
                    );
                }

                // send all other tabs to related
                if (activeTabFiles.length > 1) {
                    boostLogging.debug(
                        `User Context(${
                            analysis.AnalysisContextType.related
                        }):RelatedTabs:${activeTabFiles.join(",")}`
                    );
                    analysisContext.push({
                        type: analysis.AnalysisContextType.related,
                        data: `I have also looked at these files: ${activeTabFiles
                            .slice(1)
                            .join("\n\t")}`,
                        name: "hiddenActiveTab",
                    });
                }

                // we're going to get all the summaries for all active tabs for our target analysis types
                const activeTabAnalysis: analysis.IAnalysisContextData[] =
                    this.getActiveTabAnalysis(
                        targetAnalysisSummaries,
                        activeTabFiles
                    );
                if (activeTabAnalysis.length > 0) {
                    analysisContext.push(...activeTabAnalysis);
                }

                const currentProjectStatus: analysis.IAnalysisContextData[] =
                    this.getCurrentProjectStatusAnalysisContext();
                if (currentProjectStatus.length > 0) {
                    analysisContext.push(...currentProjectStatus);
                }

                break;

            default:
                // target nothing but the blueprint
                break;
        }

        analysisContext.push(
            ...this.getBoostSummaryAnalysisContext(targetAnalysisSummaries)
        );
        
        const trainingData : analysis.IAnalysisContextData[] = this.getRelevantTrainingData(commandId);
        if (trainingData.length > 0) {
            analysisContext.push(...trainingData);
        }

        return analysisContext;
    }

    getRelevantTrainingData(commandId?: string): analysis.IAnalysisContextData[] {

        // if we're not chat, then just skip training
        if (!commandId || commandId !== chatKernelName) {
            return [];
        }

        const trainingData: analysis.IAnalysisContextData[] = [];

        const chatData = this.chat?this.chat.data: new ChatData();

        for (const promptResponse of chatData.getFavorites()) {
            trainingData.push({
                type: analysis.AnalysisContextType.training,
                data: { prompt: promptResponse.prompt.content, response: promptResponse.response.content, context: promptResponse.prompt.context},
                name: "chatHistory",
            });
        }

        return trainingData;
    }

    getDetailedAnalysisForCurrentTabSelection(
        analysisTypes: BoostUserAnalysisType[],
        contextType: analysis.AnalysisContextType
    ): analysis.IAnalysisContextData[] {
        const sourceAnalysis: analysis.IAnalysisContextData[] = [];

        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            // No active editor
            return [];
        }

        const document = editor.document;

        // for now, we're skipping non-file active tabs
        if (document.uri.scheme !== "file") {
            return []; // Not a file
        }

        return this.getBoostSummaryAnalysisContext(
            analysisTypes,
            BoostFileType.notebook,
            contextType,
            document.uri,
            editor.selection
        );
    }

    getActiveTabAnalysis(
        analysisTypes: BoostUserAnalysisType[],
        activeTabFiles: string[]
    ): analysis.IAnalysisContextData[] {
        let activeAnalysis: analysis.IAnalysisContextData[] = [];
        let isFirstFile = true;

        const baseFolderPath = vscode.workspace.workspaceFolders?.[0].uri;
        if (!baseFolderPath) {
            return [];
        }

        for (const activeTabFile of activeTabFiles) {

            // we're going to skip getting analysis for files outside of the current project
            if (activeTabFile.startsWith("../")) {
                continue;
            }

            // Process the file with the determined context type
            const result = this.getBoostSummaryAnalysisContext(
                analysisTypes,
                BoostFileType.summary,
                isFirstFile
                    ? analysis.AnalysisContextType.userFocus
                    : analysis.AnalysisContextType.related,
                vscode.Uri.joinPath(baseFolderPath, activeTabFile)
            );

            activeAnalysis.push(...result);

            // Only the first file should have the userFocus context
            if (isFirstFile) {
                isFirstFile = false;
            }
        }
        return activeAnalysis;
    }

    readonly activeSourceContextLines: number = 50;

    getActiveEditorSurroundingLines(): string[] {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            // No active editor
            return [];
        }

        const document = editor.document;

        // for now, we're skipping non-file active tabs
        if (document.uri.scheme !== "file") {
            return []; // Not a file
        }

        const position = editor.selection.active;

        const selectedText = editor.document.getText(editor.selection);

        // if the text is actually highlighted, then only send that portion
        if (selectedText.length > 0) {
            return selectedText
                .split("\n")
                .slice(0, this.activeSourceContextLines);
        }

        // otherwise, send all the lines around the current cursor position
        let startLine = position.line - this.activeSourceContextLines / 2;
        let endLine = position.line + this.activeSourceContextLines / 2;

        // If we can't get enough lines before the position, use the extra lines after
        if (startLine < 0) {
            const extraLines = Math.abs(startLine);
            startLine = 0;
            endLine += extraLines;
        }

        // If we can't get enough lines after the position, use the extra lines before
        if (endLine >= document.lineCount) {
            const extraLines = endLine - document.lineCount + 1;
            endLine = document.lineCount - 1;
            startLine = Math.max(0, startLine - extraLines);
        }

        let lines: string[] = [];
        for (let i = startLine; i <= endLine; i++) {
            lines.push(document.lineAt(i).text);
        }

        return lines;
    }

    readonly activeNotebookContentCellSize: number = 50;
    readonly activeNotebookContentMaxSize: number =
        this.activeNotebookContentCellSize * 4;

    getActiveNotebookSurroundingLines(): string[] {
        const notebook = vscode.window.activeNotebookEditor?.notebook;

        let lines: string[] = [];

        if (!notebook) {
            // No active notebook
            return lines;
        }

        // for now, we're skipping non-file active tabs
        if (notebook.uri.scheme !== "file") {
            return lines; // Not a file
        }

        // if we're looking at a Boost Notebook, then ignore this data, since we're going to
        //      collect it separately via the tab summary analysis collection
        if (notebook.uri.fsPath.endsWith(boostnb.NOTEBOOK_EXTENSION)) {
            return lines;
        }

        const fullRange = [
            new vscode.NotebookRange(
                0,
                vscode.window.activeNotebookEditor!.notebook.cellCount
            ),
        ];
        const selections = vscode.window.activeNotebookEditor!.selections;
        const targetCells =
            selections &&
            selections.length > 0 &&
            selections[0].start !== 0 &&
            selections[0].end !== 1
                ? selections
                : fullRange;
        for (let selection of targetCells) {
            const selectedCells = notebook.getCells(selection);

            for (let cell of selectedCells) {
                // Get cell text
                const cellText = cell.document.getText();
                // we're going to increase the buffer size if a notebook is active (since that's critical info for user)
                const cellLines = cellText
                    .split("\n")
                    .slice(0, this.activeNotebookContentCellSize);
                lines.push(...cellLines);
                if (lines.length > this.activeNotebookContentMaxSize) {
                    break;
                }

                // Get output text
                for (let output of cell.outputs) {
                    for (let item of output.items) {
                        // we're going to try and grab any text that is not an error
                        if (item.mime === errorMimeType) {
                            continue;
                        }
                        const outputText = new TextDecoder().decode(item.data);
                        // if no useful text, read next item
                        if (outputText.length === 0) {
                            continue;
                        }
                        const outputLines = outputText
                            .split("\n")
                            .slice(0, this.activeNotebookContentCellSize);
                        lines.push(...outputLines);
                        if (lines.length > this.activeNotebookContentMaxSize) {
                            break;
                        }
                    }
                }
            }
        }

        // Trim to line limit
        if (lines.length > this.activeNotebookContentMaxSize) {
            lines = lines.slice(0, this.activeNotebookContentMaxSize);
        }

        return lines;
    }

    getGuidelines(command: string): string[] {
        const guidelines: string[] = [];

        if (!vscode.workspace.workspaceFolders) {
            return guidelines;
        }

        const projectGuidelinesFile = getBoostFile(
            undefined,
            { format: BoostFileType.guidelines,
              showUI: false }
        );
        if (projectGuidelinesFile) {
            const unsavedGuidelines = this.getUnsavedActiveNotebookContent(projectGuidelinesFile);
            // use unsaved guidelines only - if they are actively being edited
            if (unsavedGuidelines && unsavedGuidelines.length > 0) {
                unsavedGuidelines.forEach((unsavedGuideline: string) => {
                    if (this.sampleGuidelineRegEx.test(unsavedGuideline)) {
                        // ignore sample text
                        return;
                    }
                    guidelines.push(unsavedGuideline);
                });
                const relativePath = path.relative(vscode.workspace.workspaceFolders[0].uri.fsPath, projectGuidelinesFile.fsPath);
                boostLogging.warn(`Using unsaved Boost Project Guidelines for ${relativePath}`, false);
            }
            // only use saved guidelines if unsaved guidelines aren't found
            if (!unsavedGuidelines && fs.existsSync(projectGuidelinesFile.fsPath)) {
                const projectGuidelines = new boostnb.BoostNotebook();
                projectGuidelines.load(projectGuidelinesFile.fsPath);
                projectGuidelines.cells.forEach((cell) => {
                    if (this.sampleGuidelineRegEx.test(cell.value)) {
                        // ignore sample text
                        return;
                    }
                    guidelines.push(cell.value);
                });
            }
        }

        // this kernel guideline file
        const kernelGuidelinesFile = projectGuidelinesFile.fsPath.replace(
            boostnb.NOTEBOOK_GUIDELINES_PRE_EXTENSION,
            `.${this.getUserAnalysisType(
                command
            )}${boostnb.NOTEBOOK_GUIDELINES_PRE_EXTENSION}`
        );

        if (kernelGuidelinesFile) {
            const kernelGuidelinesUri = vscode.Uri.file(kernelGuidelinesFile);
            const unsavedGuidelines = this.getUnsavedActiveNotebookContent(kernelGuidelinesUri);
            // use unsaved guidelines only - if they are actively being edited
            if (unsavedGuidelines && unsavedGuidelines.length > 0) {
                unsavedGuidelines.forEach((unsavedGuideline: string) => {
                    if (this.sampleGuidelineRegEx.test(unsavedGuideline)) {
                        // ignore sample text
                        return;
                    }
                    guidelines.push(unsavedGuideline);
                });
                const relativePath = path.relative(vscode.workspace.workspaceFolders[0].uri.fsPath, kernelGuidelinesUri.fsPath);
                boostLogging.warn(`Using unsaved Boost Project ${command} Guidelines for ${relativePath}`, false);
            }
            if (!unsavedGuidelines && fs.existsSync(kernelGuidelinesFile)) {
                const projectGuidelines = new boostnb.BoostNotebook();
                projectGuidelines.load(kernelGuidelinesFile);
                projectGuidelines.cells.forEach((cell) => {
                    if (this.sampleGuidelineRegEx.test(cell.value)) {
                        // ignore sample text
                        return;
                    }
                    guidelines.push(cell.value);
                });
            }
        }

        return guidelines;
    }

    // returns matching in-editor cell contents
    getUnsavedActiveNotebookContent(notebookUri: vscode.Uri): string[] | undefined {
        let unsavedContent: string[] | undefined = undefined;
        vscode.window.visibleNotebookEditors.forEach((editor) => {
            if (editor.notebook.uri.scheme !== "file" ||
                editor.notebook.uri.fsPath !== notebookUri.fsPath) {
                return;
            }

            if (!editor.notebook.isDirty) {
                return;
            }

            if (!unsavedContent) {
                unsavedContent = [];
            }
            editor.notebook.getCells().forEach(cell => {
                unsavedContent!.push(cell.document.getText());
            });
        });
        return unsavedContent;
    }
    
    // get all active tab filenames (as relative paths)
    getActiveTabFilenames(): string[] {
        const baseFolderPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
        if (!baseFolderPath) {
            return [];
        }

        const activeTabFiles: string[] = [];
        // grab all text editors (active and visible)
        vscode.window.visibleTextEditors.forEach((editor) => {
            if (editor.document.uri.scheme === "file") {
                activeTabFiles.push(vscode.workspace.workspaceFolders?
                    path.relative(baseFolderPath, editor.document.uri.fsPath):
                    editor.document.uri.fsPath
                );
            } else {
                // we're skipping other tabs, like output tabs
                // editor.document.uri.fsPath for an output tab would be "output:foo"
            }
        });
        // grab all notebook editors (active and visible)
        vscode.window.visibleNotebookEditors.forEach((notebook) => {
            if (notebook.notebook.uri.scheme === "file") {
                activeTabFiles.push(vscode.workspace.workspaceFolders?
                    path.relative(baseFolderPath, notebook.notebook.uri.fsPath):
                    notebook.notebook.uri.fsPath
                );
            } else {
                // we're skipping other tabs, like non-filebased notebooks
            }
        });
        return activeTabFiles;
    }

    // get all analysis for the project, or target folder
    getBoostSummaryAnalysisContext(
        analysisTypes: BoostUserAnalysisType[],
        fileType: BoostFileType = BoostFileType.summary,
        contextType: analysis.AnalysisContextType = analysis.AnalysisContextType
            .projectSummary,
        fileTarget?: vscode.Uri,
        selection?: vscode.Selection
    ): analysis.IAnalysisContextData[] {
        const analysisContext: any[] = [];

        if (!analysisTypes || analysisTypes.length === 0 || !vscode.workspace.workspaceFolders) {
            return analysisContext;
        }

        const analysisFile = getBoostFile(fileTarget, {
            format: fileType,
            showUI: false,
        });
        if (!analysisFile || !fs.existsSync(analysisFile.fsPath)) {
            return analysisContext;
        }

        const analysisNotebook = new boostnb.BoostNotebook();
        analysisNotebook.load(analysisFile.fsPath);
        const relativeFile = vscode.workspace.asRelativePath(analysisFile);

        analysisTypes.forEach((analysisType) => {
            const outputTypes: ControllerOutputType[] = [];
            switch (analysisType) {
                case BoostUserAnalysisType.blueprint:
                    outputTypes.push(ControllerOutputType.blueprint);
                    break;
                case BoostUserAnalysisType.compliance:
                    outputTypes.push(ControllerOutputType.compliance);
                    outputTypes.push(ControllerOutputType.complianceFunction);
                    break;
                case BoostUserAnalysisType.security:
                    outputTypes.push(ControllerOutputType.analyze);
                    outputTypes.push(ControllerOutputType.analyzeFunction);
                    outputTypes.push(ControllerOutputType.performance);
                    outputTypes.push(ControllerOutputType.performanceFunction);
                    break;
                case BoostUserAnalysisType.documentation:
                    outputTypes.push(ControllerOutputType.explain);
                    break;
                default:
                    throw new Error(`Unknown analysis type ${analysisType}`);
            }
            for (const outputType of outputTypes) {
                switch (fileType) {
                    case BoostFileType.summary:
                        const analysisCell = findCellByKernel(
                            analysisNotebook,
                            outputType
                        ) as boostnb.BoostNotebookCell;

                        // skip if no summary or empty data
                        if (!analysisCell?.value) {
                            break;
                        }

                        const activeSummaryNotebook =
                            vscode.window.activeNotebookEditor?.notebook;

                        if (
                            activeSummaryNotebook?.uri.fsPath ===
                                analysisNotebook.fsPath ||
                            contextType ===
                                analysis.AnalysisContextType.userFocus
                        ) {
                            boostLogging.debug(
                                `User Context(${analysis.AnalysisContextType.userFocus}):ActiveSummaryNotebook:${relativeFile}:${outputType}`
                            );

                            analysisContext.push({
                                type: analysis.AnalysisContextType.userFocus,
                                data: `Summary analysis for the code:\n\n\`\`\`${analysisCell.value
                                    .split("\n")
                                    .join("\n\t")}\`\`\``,
                                name: "activeNotebook",
                            });
                        } else {
                            boostLogging.debug(
                                `User Context(${contextType}):SummaryNotebook:${relativeFile}:${outputType}`
                            );

                            analysisContext.push({
                                type: contextType,
                                data: `Other summary analysis of the code I have reviewed is:\n\n\`\`\`${analysisCell.value
                                    .split("\n")
                                    .join("\n\t")}\`\`\``,
                                name: analysisType,
                            } as analysis.IAnalysisContextData);
                        }
                        break;

                    case BoostFileType.notebook:
                        const analyzedCellData: string[] = [];

                        analyzedCellData.push(
                            ...getAnalysisForSourceTarget(
                                analysisNotebook,
                                outputType,
                                selection
                            )
                        );
                        const activeNotebook =
                            vscode.window.activeNotebookEditor?.notebook;

                        // skip empty cells
                        if (analyzedCellData.length === 0) {
                            break;
                        }

                        if (
                            activeNotebook?.uri.fsPath ===
                                analysisNotebook.fsPath ||
                            contextType ===
                                analysis.AnalysisContextType.userFocus
                        ) {
                            boostLogging.debug(
                                `User Context(${analysis.AnalysisContextType.userFocus}):ActiveNotebook:${relativeFile}:${outputType}`
                            );

                            analysisContext.push({
                                type: analysis.AnalysisContextType.userFocus,
                                data: `${analysisType} analysis for the code:\n\n\`\`\`${analyzedCellData.join(
                                    "\n\t"
                                )}\`\`\``,
                                name: "activeNotebook",
                            });
                        } else {
                            boostLogging.debug(
                                `User Context(${contextType}):Notebook:${relativeFile}:${outputType}`
                            );

                            analysisContext.push({
                                type: contextType,
                                data: `Other ${analysisType} analysis data for the code I have is:\n\n${analyzedCellData.join(
                                    "\n\t"
                                )}`,
                                name: analysisType,
                            } as analysis.IAnalysisContextData);
                        }
                        break;
                    default:
                        throw new Error(
                            `Unknown analysis file type ${fileType}`
                        );
                }
            }
        });

        return analysisContext;
    }

    getCurrentProjectStatusAnalysisContext() : analysis.IAnalysisContextData[] {
        const projectContextData : analysis.IAnalysisContextData[] = [];

        const projectData : BoostProjectData = this.getBoostProjectData()!;

        const rawProjectContextData = this.convertProjectDataToContextData(projectData);

        projectContextData.push({
            type: analysis.AnalysisContextType.related,
            data: JSON.stringify(rawProjectContextData.projectSummary, null, 2),
            name: "projectSummary"
        });

        projectContextData.push({
            type: analysis.AnalysisContextType.related,
            data: JSON.stringify(rawProjectContextData.account, null, 2),
            name: "accountInfo"
        });

        projectContextData.push({
            type: analysis.AnalysisContextType.related,
            data: JSON.stringify(rawProjectContextData.analysisSummary, null, 2),
            name: "analysisSummary"
        });

        projectContextData.push({
            type: analysis.AnalysisContextType.related,
            data: JSON.stringify(rawProjectContextData.analyzedFiles, null, 2),
            name: "analyzedFiles"
        });

        return projectContextData;
    }

    convertProjectDataToContextData(projectData: BoostProjectData) : ProjectContextData
    {
        const compressedData: ProjectContextData = {
            projectSummary: {
                project: projectData.summary?.projectName || null,
                files: {
                    total: projectData.summary?.filesToAnalyze || null,
                    analyzed: projectData.summary?.filesAnalyzed || null,
                    ignored: null, // projectData.summary?.filesIgnored || null,
                },
                analysisState: projectData.uiState?.analysisState || null,
                analysisMode: projectData.uiState.activityBarState?.summaryViewState?.analysisMode || null,
                types: projectData.uiState.activityBarState.summaryViewState?.analysisTypesState || null,
                issues: projectData.summary?.issues || []
            },
            account: projectData.account || null,
            analysisSummary: {
                keys: [
                    "status",
                    "analysisModeGroup",
                    "SourceCodeBlocksCompletelyAnalyzed",
                    "errorsWhileRunningAnalysis",
                    "issuesFoundInSourceCode",
                    "totalSourceCodeBlocksToAnalyze",
                    "analyzedFiles"]
            },
            analyzedFiles: {}
        };
    
        // Compress sectionSummary
        for (let section in projectData.sectionSummary) {
            if (["summary", "bugAnalysis", "complianceCode", "performance", "flowDiagram"].includes(section)) {
                continue;
            }
            let values = projectData.sectionSummary[section];

            let userFriendlySectionName = section;
            let sectionGroupName = section;

            for (const kernel of this.kernels.values()) {
                if (kernel.outputType !== section) {
                    continue;
                }
                userFriendlySectionName = kernel.outputHeader;
                sectionGroupName = kernel.displayCategory;
                break; // exit the loop as soon as you've found the kernel
            }

            compressedData.analysisSummary[userFriendlySectionName] = [
                values.status || null,
                sectionGroupName,
                values.completedCells || null,
                values.errorCells || null,
                values.issueCells || null,
                values.totalCells || null,
                values.filesAnalyzed || null
            ];
        }
    
        // Compress files
        for (let fileName in projectData.files) {
            let statusSet = new Set<string>();
    
            for (let section in projectData.files[fileName].sections) {
                if ([ControllerOutputType.summary,
                    ControllerOutputType.analyze,
                    ControllerOutputType.compliance,
                    ControllerOutputType.performance,
                    ControllerOutputType.flowDiagram].includes(
                        ControllerOutputType[section as keyof typeof ControllerOutputType])) {
                    continue;
                }
    
                statusSet.add(projectData.files[fileName].sections[section].status || "");
            }
    
            let finalStatus: string;
            if (statusSet.size === 0) {
                finalStatus = "not-started";
            } else if (statusSet.size === 1 && statusSet.has("completed")) {
                finalStatus = "completed";
            } else {
                finalStatus = "incomplete";
            }
    
            compressedData.analyzedFiles[fileName] = finalStatus;
        }
    
        return compressedData;
    }
    
    syncProblemsInCell(
        cell: vscode.NotebookCell | boostnb.BoostNotebookCell,
        problems: vscode.DiagnosticCollection,
        cellsBeingRemoved: boolean = false
    ) {
        const usingBoostNotebook = "value" in cell;

        const cellUri = usingBoostNotebook
            ? vscode.Uri.file(cell.id as string)
            : cell.document.uri;

        // if no problems for this cell, skip it
        const thisCellProblems = problems.get(cellUri);
        if (!thisCellProblems || thisCellProblems.length === 0) {
            return;
        }

        // Check if the cell has any error output
        const hasErrorOutput = cell.outputs.some((output: any) => {
            for (const item of output.items) {
                return item.mime === errorMimeType;
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
                    return item.mime === errorMimeType;
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
}
