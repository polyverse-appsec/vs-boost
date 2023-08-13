import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as _ from "lodash";

import { BoostExtension } from "./extension/BoostExtension";
import { aiName } from "./chat_view";

import { WorkflowEngine, WorkflowError } from "./utilities/workflow_engine";

import {
    BoostCommands,
    getKernelName,
    ProcessCurrentFolderOptions,
} from "./extension/extension";

import {
    getAllProjectFiles,
} from "./utilities/files";

import { NOTEBOOK_TYPE } from "./data/jupyter_notebook";

import { summarizeKernelName } from "./controllers/summary_controller";
import { analyzeKernelName } from "./controllers/analyze_controller";
import { analyzeFunctionKernelName } from "./controllers/analyze_function_controller";
import { complianceKernelName } from "./controllers/compliance_controller";
import { blueprintKernelName } from "./controllers/blueprint_controller";
import { flowDiagramKernelName } from "./controllers/flowdiagram_controller";
import { explainKernelName } from "./controllers/explain_controller";
import { boostLogging } from "./utilities/boostLogging";
import { BoostConfiguration } from "./extension/boostConfiguration";
import { complianceFunctionKernelName } from "./controllers/compliance_function_controller";
import { performanceFunctionKernelName } from "./controllers/performance_function_controller";
import { BoostProjectData } from "./data/BoostProjectData";
import {
    FileSummaryItem,
    noProjectOpenMessage,
    extensionNotFullyActivated,
    extensionFailedToActivate,
} from "./data/boostprojectdata_interface";
import { quickBlueprintKernelName } from "./controllers/quick_blueprint_controller";
import { performanceKernelName } from "./controllers/performance_controller";
import { BoostUserAnalysisType } from "./userAnalysisType";
import { quickComplianceSummaryKernelName } from "./controllers/quick_compliance_summary_controller";
import { quickSecuritySummaryKernelName } from "./controllers/quick_security_summary_controller";
import { marked } from "marked";
import { BoostFileType, findCellByKernel, getBoostFile } from "./extension/extension";
import { BoostNotebook, BoostNotebookCell } from "./data/jupyter_notebook";
import { ControllerOutputType } from "./controllers/controllerOutputTypes";
import { getOrCreateBlueprintUri, getOrCreateGuideline } from "./extension/extension";
import * as boostnb from "./data/jupyter_notebook";
import { quickPerformanceSummaryKernelName } from "./controllers/quick_performance_summary_controller";
import { codeGuidelinesKernelName } from "./controllers/codeguidelines_controller";

export const summaryViewType = "polyverse-boost-summary-view";

export class BoostSummaryViewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private _context: vscode.ExtensionContext;

    constructor(
        private readonly context: vscode.ExtensionContext,
        private _boostExtension: BoostExtension
    ) {
        this._context = context;
    }

    public async resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        try {
            this._resolveWebviewView(webviewView, context, _token);
        } catch (e) {
            boostLogging.error(
                `Could not load Boost Summary View due to ${e}`,
                false
            );
        }
    }

    async _resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            // Allow scripts in the webview
            enableScripts: true,

            localResourceRoots: [this.context.extensionUri],
        };

        webviewView.webview.html = this._getHtmlForWebview(
            webviewView.webview,
            this._boostExtension.getBoostProjectData()
        );

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.command) {
                case "open_file":
                    {
                        await this._openFile(
                            data.file,
                            this._boostExtension.getBoostProjectData()
                        );
                    }
                    break;
                case "analyze_all":
                    {
                        await this.analyzeAll(data.analysisTypes, data.fileLimit);
                    }

                    break;
                case "refresh_deep_summary": {
                    await this.refreshDeepSummary();
                }
            }
        });
    }

    public refresh() {
        try {
            this._refresh();
        } catch (e) {
            boostLogging.error(
                `Could not refresh Boost Summary View due to ${e}`,
                false
            );
        }
    }

    async _refresh() {
        if (this._view) {
            this._view.webview.html = this._getHtmlForWebview(
                this._view.webview,
                this._boostExtension.getBoostProjectData()
            );
            this._view.show?.(true);
        }
    }

    private _getHtmlForWebview(
        webview: vscode.Webview,
        boostprojectdata: BoostProjectData
    ) {
        const htmlPathOnDisk = vscode.Uri.joinPath(
            this.context.extensionUri,
            "resources",
            "dashboard",
            "summary.html"
        );
        const jsPathOnDisk = vscode.Uri.joinPath(
            this.context.extensionUri,
            "out",
            "dashboard",
            "summary",
            "main.js"
        );
        const jsSrc = webview.asWebviewUri(jsPathOnDisk);
        const nonce = "nonce-123456"; // TODO: add a real nonce here
        const rawHtmlContent = fs.readFileSync(htmlPathOnDisk.fsPath, "utf8");

        let message;
        if (!this._boostExtension.finishedActivation) {
            message = extensionNotFullyActivated;
        } else if (!this._boostExtension.successfullyActivated) {
            message = extensionFailedToActivate;
        } else if (!boostprojectdata || !vscode.workspace.workspaceFolders) {
            message = noProjectOpenMessage;
        }

        if (message) {
            return `<html><body><h3>Project Status</h3><p>${message}</p></body></html>`;
        }
        const convert = marked.parse;
        const blueprintFile = boostprojectdata.summary.summaryUrl;
        const guidelinesFile = getBoostFile(
            undefined,
            BoostFileType.guidelines,
            false
        ).fsPath;

        const summaryMarkdown = this._getMarkdownForSummaries();

        const template = _.template(rawHtmlContent);
        const htmlContent = template({
            jsSrc,
            nonce,
            boostprojectdata,
            summaryMarkdown,
            convert,
            blueprintFile,
            guidelinesFile,
            aiName,
        });

        return htmlContent;
    }

    public addJobs(
        job: string,
        files: [string],
        boostprojectdata: BoostProjectData
    ) {
        //if this._jobs[jobs] exists, add count to it, otherwise set it to count
        boostprojectdata.addJobs(job, files);
        const payload = {
            command: "refreshUI",
            boostprojectdata: boostprojectdata,
            error: null,
        };
        this._view?.webview.postMessage(payload);
    }

    public finishJob(
        job: string,
        file: string,
        summary: FileSummaryItem | null,
        boostprojectdata: BoostProjectData,
        error: Error | null
    ) {
        boostprojectdata.finishJob(job, file, summary, error);
        const payload = {
            command: "refreshUI",
            error: error,
            boostprojectdata: boostprojectdata,
        };
        this._view?.webview.postMessage(payload);
    }

    public finishAllJobs(boostprojectdata: BoostProjectData) {
        boostprojectdata.finishAllJobs();
        const payload = {
            command: "finishAllJobs",
            boostprojectdata: boostprojectdata,
        };
        this._view?.webview.postMessage(payload);
    }

    public addQueue(
        jobs: string[],
        files: string[],
        boostprojectdata: BoostProjectData
    ) {
        boostprojectdata.addQueue(jobs, files);
        const payload = {
            command: "refreshUI",
            boostprojectdata: boostprojectdata,
            error: null,
        };
        this._view?.webview.postMessage(payload);
    }

    private async _openFile(relativePath: string, boostprojectdata: any) {
        if (!vscode.workspace.workspaceFolders?.[0]) {
            boostLogging.error(
                "Please open a Project folder or workspace first",
                true
            );
            return;
        }
        // handle the special cases of blueprint and guidelines. in the case of
        // guidelines, we look for the extension, as we don't store that in boostdata
        // boostnb.NOTEBOOK_GUIDELINES_EXTENSION
        let targetNotebookUri: vscode.Uri;
        let docAbsolutePath: string;
        if (relativePath === boostprojectdata.summary.summaryUrl) {
            targetNotebookUri = await getOrCreateBlueprintUri(
                this.context,
                relativePath
            );
            docAbsolutePath = targetNotebookUri.fsPath;
        } else if (
            relativePath.endsWith(boostnb.NOTEBOOK_GUIDELINES_EXTENSION)
        ) {
            targetNotebookUri = getBoostFile(
                undefined,
                BoostFileType.guidelines
            );
            getOrCreateGuideline(targetNotebookUri, BoostFileType.guidelines);
            docAbsolutePath = targetNotebookUri.fsPath;
        } else {
            docAbsolutePath = path.join(
                vscode.workspace.workspaceFolders?.[0].uri.fsPath as string,
                relativePath
            );
        }

        const docUri = vscode.Uri.file(docAbsolutePath);
        try {
            //if the filename ends with boost-notebook, then open the notebook
            if (docUri.fsPath.endsWith(".boost-notebook")) {
                const document = await vscode.workspace.openNotebookDocument(
                    docUri
                );
                await vscode.window.showNotebookDocument(document);
            } else {
                // otherwise, open as text
                await vscode.window.showTextDocument(docUri);
            }
        } catch (e) {
            boostLogging.error(
                `Could not open file ${docAbsolutePath} due to ${e}`,
                true
            );
        }
    }

    private async analyzeAll(analysisTypes: string[], fileLimit: number) {
        if (BoostConfiguration.processFilesInGroups) {
            await this.processAllFilesInRings(analysisTypes, fileLimit);
        } else {
            await this.processAllFilesInSequence(analysisTypes, fileLimit);
        }
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
                getKernelName(performanceFunctionKernelName),
            ],
        ],
        [
            BoostUserAnalysisType.compliance,
            [
                getKernelName(complianceFunctionKernelName),
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

    async processAllFilesInRings(analysisTypes: string[], fileLimit: number) {
        const tasks : any[] = [];

        // we're going to dynamically build the list at the start of the run
        //      so we get the best most up to date list of files from
        //      blueprint
        const prepareFileList = async () => {
            // get the entire list of files to analyze
            const allFiles = await getAllProjectFiles();
            boostLogging.debug(`Total Project is ${allFiles.length} files`);
    
            // get the requested # of files only
            const limitedFiles = (fileLimit !== 0)?allFiles.slice(0, fileLimit):allFiles;
            if (fileLimit !== 0) {
                boostLogging.debug(`Processing only ${limitedFiles.length} files by request`);
            }
            limitedFiles.forEach((file) => {
                tasks.push(
                    () => {
                        // log the relative path for simplicity for user
                        const rootPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath as string;
                        const relativePath = path.relative(rootPath, file);

                        const dynamicFunc = async () => { // use arrow function
                            const fileAnalysisTasks : any[] = [];
            
                            for (const [key, value] of this.ringFileAnalysisMap) {
                                fileAnalysisTasks.push(
                                    () => async () => {
                                        if (!analysisTypes.includes(key)) {
                                            throw new WorkflowError("skip", `Skipping File Analysis ${key} by user request`);
                                        }
                                        const fileUri = vscode.Uri.parse(file);
                                        await this.processDepthOnRingFileTask(fileUri, value);
                                    }
                                );
                                // If you still want to name the function, do so here, outside the pushed function.
                                Object.defineProperty(fileAnalysisTasks[fileAnalysisTasks.length - 1], 'name', { value: key, writable: false });
                            }
            
                            const fileAnalysisEngine = new WorkflowEngine(fileAnalysisTasks, {
                                pattern: [1],
                                logger: boostLogging,
                            });
            
                            const fileAnalysisResults = await fileAnalysisEngine.run();
                            boostLogging.info(`${relativePath} Analysis completed: ${fileAnalysisResults.filter((x) => !x[0] || !(x[0] instanceof WorkflowError)).length}`);
                            boostLogging.info(`${relativePath} Analysis skipped: ${fileAnalysisResults.filter((x) => x[0] && x[0] instanceof WorkflowError && (x[0] as WorkflowError).type === "skip").length}`);
            
                            return file;
                        };
                        
                        // Name the function dynamically based on the file (to improve logging)
                        Object.defineProperty(dynamicFunc, 'name', { value: relativePath, writable: false });
                        
                        return dynamicFunc;
                    }
                );
            });
        };
 
        const beforeRun = [
            () => async () => {
                if (BoostConfiguration.simulateServiceCalls) {
                    boostLogging.debug(`Simulate:executeCommand: processProject(${getKernelName(quickBlueprintKernelName)})`);
                } else {
                    // we want to run blueprint first so we get the excludes and priority list before
                    //   we build the task list for the file rings
                    await vscode.commands.executeCommand(
                        NOTEBOOK_TYPE +
                        "." +
                        BoostCommands.processProject,
                        getKernelName(quickBlueprintKernelName)
                    );
                }

                await prepareFileList();

                if (BoostConfiguration.simulateServiceCalls) {
                    boostLogging.debug(`Simulate:executeCommand: loadCurrentFolder()`);
                    boostLogging.debug(`Simulate:executeCommand: refreshProjectData()`);
                } else {

                    // creates and loads/refreshes/rebuilds all notebook files
                    await vscode.commands.executeCommand(
                        NOTEBOOK_TYPE + "." + BoostCommands.loadCurrentFolder,
                        undefined
                    );
                    // refresh project data (since we may have rebuilt source/files)
                    return vscode.commands.executeCommand(
                        NOTEBOOK_TYPE + "." + BoostCommands.refreshProjectData
                    );
                }
            },
        ];

        const afterEachTask = [
            () => async (inputs: any[]) => {
                const path = inputs[0]; // first param is the file path

                if (!BoostConfiguration.alwaysRunSummary) {
                    boostLogging.info(`Skipping summary for source file: ${path}`);
                    return;
                }

                if (BoostConfiguration.simulateServiceCalls) {
                    boostLogging.debug(`Simulate:executeCommand: processCurrentFolder(${path}, ${getKernelName(summarizeKernelName)})`);
                } else {
                    // build the summary notebook for this file
                    return vscode.commands.executeCommand(
                        NOTEBOOK_TYPE + "." + BoostCommands.processCurrentFolder,
                        vscode.Uri.parse(path),
                        getKernelName(summarizeKernelName)
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
                                NOTEBOOK_TYPE + "." + BoostCommands.refreshProjectData
                            );
                        }
                    },
                ];

                const summaryTasks : any[] = [];

                for (const [key, value] of this.ringSummaryAnalysisMap) {
                    summaryTasks.push(
                        () => async () => {
                            if (!analysisTypes.includes(key)) {
                                throw new WorkflowError("skip", `Skipping Summary Analysis ${key} by user request`);
                            }
                            return this.processQuickSummaryOfRingFileTaskGroup(value);
                        }
                    );
                    // If you still want to name the function, do so here, outside the pushed function.
                    Object.defineProperty(summaryTasks[summaryTasks.length - 1], 'name', { value: key, writable: false });
                }

                const summaryEngine = new WorkflowEngine(summaryTasks, {
                    afterRun: afterRingSummaryRun,
                    pattern: [1],
                    logger: boostLogging,
                });

                const summaryResults = await summaryEngine.run();
                boostLogging.info(`Workflow Analysis Summaries completed: ${summaryResults.filter((x) => !x[0] || !(x[0] instanceof WorkflowError)).length}`);
                boostLogging.info(`Workflow Analysis Summaries skipped: ${summaryResults.filter((x) => x[0] && x[0] instanceof WorkflowError && (x[0] as WorkflowError).type === "skip").length}`);
            },
        ];
        const afterRun = [
            () => async () => {
                if (BoostConfiguration.simulateServiceCalls) {
                    boostLogging.debug(`Simulate:executeCommand: refreshProjectData()`);
                } else {
                    // refresh project data, refresh the UI
                    await vscode.commands.executeCommand(
                        NOTEBOOK_TYPE + "." + BoostCommands.refreshProjectData
                    );
                    this.finishAllJobs(this._boostExtension.getBoostProjectData());
                }
                this.refresh();
            },
        ];

        // if we're doing a targeted limit, then process 1 sample then small batch at a time
        // if we have no limit, then double ring size each iteration
        const pattern = (fileLimit === 0)?
            [1, 2, 4, 8, 16]    // infinite limit, doubling in size each ring
            :[1, 4];            // limited (sample), 1 sample then 4 at a time

        const engine = new WorkflowEngine(tasks, {
            beforeRun: beforeRun,
            afterEachTask: afterEachTask,
            afterEachTaskGroup: afterEachTaskGroup,
            afterRun: afterRun,
            pattern: pattern,
            logger: boostLogging,
        });

        const allResults = await engine.run();

        let successfulTasksCompleted = 0;
        let workflowCompletion = "completed";
        allResults.forEach((result) => {
            if (!result) {
                return;
            }
            successfulTasksCompleted += result.filter((r : any) => {
                if (!r || !(r instanceof Error)) {
                    return true;
                } else if (r instanceof WorkflowError) {
                    const error = r as WorkflowError;
                    if (error.type === "cancel" || error.type === "abort") {
                        workflowCompletion = error.type;
                    }
                }
            }).length;
        });
        switch (workflowCompletion) {
            case "cancel":
                boostLogging.error(`Graceful Cancel of Workflow Analysis: tasks completed: ${successfulTasksCompleted}`);
                break;
            case "abort":
                boostLogging.error(`Unexpected Abort of Workflow Analysis: tasks completed: ${successfulTasksCompleted}`);
                break;
            case "completed":
                boostLogging.info(`Successful Workflow Analysis tasks completed: ${successfulTasksCompleted}`);
                break;
            default:
                boostLogging.error(`Unknown Workflow Completion: ${workflowCompletion}`);
        }
    }

    private async processDepthOnRingFileTask(fileUri: vscode.Uri, value: string[]) {
        // log the relative path for simplicity for user
        const rootPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath as string;
        const relativePath = path.relative(rootPath, fileUri.fsPath);

        const analysisTypeKernelTasks : any[] = [];
            
        for (const analysisKernelName of value) {
            analysisTypeKernelTasks.push(
                () => async () => {
                    if (BoostConfiguration.simulateServiceCalls) {
                        boostLogging.debug(`Simulate:executeCommand: processCurrentFolder(${fileUri}, ${analysisKernelName})`);
                        return;
                    }
                    const refreshed = await vscode.commands.executeCommand(
                        NOTEBOOK_TYPE +
                        "." +
                        BoostCommands.processCurrentFolder,
                        {
                            kernelCommand: analysisKernelName,
                            filelist: [fileUri],
                        } as ProcessCurrentFolderOptions
                    );
                    if (!refreshed) {
                        throw new WorkflowError("skip", `Analysis for ${relativePath} was skipped - all analyzable content was already up to date`);
                    }
                }
            );
            Object.defineProperty(analysisTypeKernelTasks[analysisTypeKernelTasks.length - 1], 'name', { value: `${relativePath}:${analysisKernelName}`, writable: false });
        }

        const fileAnalysisEngine = new WorkflowEngine(analysisTypeKernelTasks, {
            pattern: [1],
            logger: boostLogging,
        });

        const analysisTypeResults = await fileAnalysisEngine.run();
        boostLogging.info(`${relativePath} Analysis Kernels completed: ${analysisTypeResults.filter((x) => !x[0] || !(x[0] instanceof WorkflowError)).length}`);
        boostLogging.info(`${relativePath} Analysis Kernels skipped: ${analysisTypeResults.filter((x) => x[0] && x[0] instanceof WorkflowError && (x[0] as WorkflowError).type === "skip").length}`);
    }

    private async processQuickSummaryOfRingFileTaskGroup(value: string[]) {
        for (const analysisKernelName of value) {
            if (BoostConfiguration.simulateServiceCalls) {
                boostLogging.debug(`Simulate:executeCommand: processProject(${analysisKernelName})`);
                continue;
            }
            await vscode.commands.executeCommand(
                NOTEBOOK_TYPE +
                "." +
                BoostCommands.processProject,
                analysisKernelName
            );
        }
    }

    readonly analysisMap = new Map([
        [
            BoostUserAnalysisType.documentation,
            [
                getKernelName(quickBlueprintKernelName),
                getKernelName(explainKernelName),
                getKernelName(flowDiagramKernelName),
            ],
        ],
        [
            BoostUserAnalysisType.security,
            [
                getKernelName(analyzeFunctionKernelName),
                getKernelName(quickSecuritySummaryKernelName),
                // getKernelName(performanceFunctionKernelName),
                // getKernelName(quickPerformanceSummaryKernelName),
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
                getKernelName(blueprintKernelName),
                getKernelName(analyzeKernelName),
                getKernelName(complianceKernelName),
                getKernelName(performanceKernelName),
                getKernelName(summarizeKernelName),
            ],
        ],
    ]);

    async processAllFilesInSequence(analysisTypes: string[], fileLimit: number) {
        // creates and loads/refreshes/rebuilds all notebook files
        await vscode.commands.executeCommand(
            NOTEBOOK_TYPE + "." + BoostCommands.loadCurrentFolder,
            undefined
        );

        // refresh project data
        await vscode.commands.executeCommand(
            NOTEBOOK_TYPE + "." + BoostCommands.refreshProjectData
        );

        try {
            let runSummary = false;

            for (const [key, value] of this.analysisMap) {
                if (!analysisTypes.includes(key)) {
                    continue;
                }
                if (
                    BoostConfiguration.runAllTargetAnalysisType &&
                    !(
                        BoostConfiguration.runAllTargetAnalysisType as string
                    ).includes(key)
                ) {
                    continue;
                }
                try {
                    await this.processEachStepOfAnalysisStage(value, fileLimit);

                    if (BoostConfiguration.alwaysRunSummary) {
                        runSummary = true;
                    }
                } catch (error) {
                    boostLogging.error(
                        `Error while running ${key} analysis:: ${error}`,
                        true
                    );
                }
    
                    // refresh project data
                await vscode.commands.executeCommand(
                    NOTEBOOK_TYPE + "." + BoostCommands.refreshProjectData
                );
            }

            if (
                (runSummary &&
                    // don't run summary if dev overrode it, or requested it specifically
                    !BoostConfiguration.runAllTargetAnalysisType) ||
                (BoostConfiguration.runAllTargetAnalysisType &&
                    (
                        BoostConfiguration.runAllTargetAnalysisType as string
                    ).includes(summarizeKernelName))
            ) {
                // summary across all files
                await vscode.commands.executeCommand(
                    NOTEBOOK_TYPE + "." + BoostCommands.processCurrentFolder,
                    {
                        kernelCommand: getKernelName(summarizeKernelName),
                    } as ProcessCurrentFolderOptions
                );
            }
        } finally {
            // refresh project data
            await vscode.commands.executeCommand(
                NOTEBOOK_TYPE + "." + BoostCommands.refreshProjectData
            );
            this.finishAllJobs(this._boostExtension.getBoostProjectData());
            this.refresh();
        }
    }

    private async processEachStepOfAnalysisStage(value: string[], fileLimit: number) {
        for (const analysisKernelName of value) {
            if (BoostConfiguration.runAllTargetAnalysisType &&
                !(
                    BoostConfiguration.runAllTargetAnalysisType as string
                ).includes(analysisKernelName)) {
                continue;
            }
            // we're skipping deep summaries for now to reduce
            //    processing time and unnecessary duplication
            if (analysisKernelName in [
                getKernelName(blueprintKernelName),
                getKernelName(summarizeKernelName),
            ]) {
                if (!BoostConfiguration.alwaysRunSummary) {
                    boostLogging.debug(`Skipping ${analysisKernelName} analysis except by alwaysRunSummary config request`);
                    continue;
                }
            }

            // quick operations uses the project-level command
            if ([
                getKernelName(quickBlueprintKernelName),
                getKernelName(quickComplianceSummaryKernelName),
                getKernelName(quickSecuritySummaryKernelName),
            ].includes(analysisKernelName)) {
                await vscode.commands.executeCommand(
                    NOTEBOOK_TYPE +
                    "." +
                    BoostCommands.processProject,
                    analysisKernelName
                );
                // while all other commands run scans across all source files
            } else {
                await vscode.commands.executeCommand(
                    NOTEBOOK_TYPE +
                    "." +
                    BoostCommands.processCurrentFolder,
                    {
                        kernelCommand: analysisKernelName,
                        fileLimit: fileLimit,
                    } as ProcessCurrentFolderOptions
                );
            }
        }
    }

    private _getMarkdownForSummaries(): { [key: string]: string } {
        let markdown = {} as { [key: string]: string };
        if (!this._view?.webview) {
            return {};
        }

        const userFriendlyNames = {
            [ControllerOutputType.blueprint]: "Documentation",
            [ControllerOutputType.analyze]: "Security",
            [ControllerOutputType.compliance]: "Compliance",
        };

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

        const summaryDataUri = getBoostFile(
            workspaceFolder?.uri,
            BoostFileType.summary
        );

        const boostNotebook = new BoostNotebook();
        // if we have a summary file, load it

        if (fs.existsSync(summaryDataUri.fsPath)) {
            boostNotebook.load(summaryDataUri.fsPath);
        }
        //loop through the userFriendlyNames and add the markdown to the markdown object
        for (const [key, value] of Object.entries(userFriendlyNames)) {
            let cell = findCellByKernel(
                boostNotebook,
                key
            ) as BoostNotebookCell;
            let cellmd = cell?.value;

            if (!cellmd) {
                cellmd = `${value} summary not yet run - please use the [Dashboard Control](# "polyverse_boost_dashboard") to generate content.`;
            }
            //if the cell markdown starts with Error
            if (cellmd.startsWith("Error:")) {
                cellmd =
                    `***Error Building ${value} Summary***\n\n` +
                    `Please review below error, then please use the [Dashboard Control](# "polyverse_boost_dashboard") to regenerate the analysis.\n\n` +
                    cellmd;
            }
            markdown[key] = cellmd;
        }
        return markdown;
    }

    private async refreshDeepSummary() {
        // creates and loads all notebook files
        await vscode.commands.executeCommand(
            NOTEBOOK_TYPE + "." + BoostCommands.loadCurrentFolder,
            undefined
        );

        // refresh project data
        await vscode.commands.executeCommand(
            NOTEBOOK_TYPE + "." + BoostCommands.refreshProjectData
        );

        // don't run summary unless overriden by config setting
        if (!BoostConfiguration.alwaysRunSummary) {
            boostLogging.debug(`Skipping ${getKernelName(summarizeKernelName)} analysis except by alwaysRunSummary config request`);
        } else {
            // summary across all files
            const refreshed = await vscode.commands.executeCommand(
                NOTEBOOK_TYPE + "." + BoostCommands.processCurrentFolder,
                undefined,
                getKernelName(summarizeKernelName)
            );
        }

        // refresh project data
        await vscode.commands.executeCommand(
            NOTEBOOK_TYPE + "." + BoostCommands.refreshProjectData
        );
    }
}
