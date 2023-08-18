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
    AnalysisState,
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
            { format: BoostFileType.guidelines,
              showUI: false}
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
                { format: BoostFileType.guidelines }
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
        this._boostExtension.getBoostProjectData()?.setAnalysisState(AnalysisState.preparing);
        try
        {
            if (BoostConfiguration.processFilesInGroups) {
                await this.processAllFilesInRings(analysisTypes, fileLimit);
            } else {
                await this.processAllFilesInSequence(analysisTypes, fileLimit);
            }
        } catch (e) {
            boostLogging.error(`Run Selected Analysis failed: ${e}`, true);
        } finally {
            // make sure we always restore the analysis state to quiescent after finishing analysis
            this.finishAllJobs(this._boostExtension.getBoostProjectData());
            this.refresh();
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
        const projectData = this._boostExtension.getBoostProjectData();
        if (!projectData) {
            throw new WorkflowError("abort", "Aborting analysis - Unable to determine current account status.");
        }
        const processingEnabled = projectData.account.enabled;
        if (!processingEnabled) {
            throw new WorkflowError("abort", `Account is ${projectData.account.status} and cannot perform analysis. Please update your account in the Account Dashboard.`);
        }
    }

    async processAllFilesInRings(analysisTypes: string[], fileLimit: number) {
        const tasks : any[] = [];

        // check current account status before even starting
        this.checkAccountEnabledBeforeContinuingAnalysis();

        const workflowName = "Run Selected Analysis";

        // we're going to dynamically build the list at the start of the run
        //      so we get the best most up to date list of files from
        //      blueprint
        const prepareFileList = async () => {
            // get the entire list of files to analyze
            const allFiles = await getAllProjectFiles();
            boostLogging.info(`Total Project is ${allFiles.length} files`);
    
            // get the requested # of files only
            const limitedFiles = (fileLimit !== 0)?allFiles.slice(0, fileLimit):allFiles;
            if (fileLimit !== 0) {
                boostLogging.info(`Processing only ${limitedFiles.length} files by request`);
            }

            //compute the ControllerOutputTypes for the analysisTypes by looking at the ringSummaryAnalysisMap
            //with the analysisTypes, turn into an array. the map returns an array of contollers, we
            // get the outputtype with controller.outputType

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

            this.addQueue(controllerOutputTypes, limitedFiles, this._boostExtension.getBoostProjectData());

            limitedFiles.forEach((file) => {
                tasks.push(
                    () => {
                        // log the relative path for simplicity for user
                        const rootPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath as string;
                        const relativePath = path.relative(rootPath, file);

                        const fileDynamicFunc = async () => { // use arrow function
                            const fileAnalysisTasks : any[] = [];

                            const fileAnalysisWorkflowName = `${workflowName}-File ${relativePath}`;
                            for (const [key, value] of this.ringFileAnalysisMap) {
                                fileAnalysisTasks.push(
                                    () => {
                                        const analysisTypeDynamicFunc = async () => {
                                            if (!analysisTypes.includes(key)) {
                                                throw new WorkflowError("skip", `Skipping File ${key} Analysis by user request`);
                                            }
                                            const fileUri = vscode.Uri.parse(file);
                                            const areaAnalysisWorkflowName = `${fileAnalysisWorkflowName}-${key}`;
                                            await this.processDepthOnRingFileTask(fileUri, value, areaAnalysisWorkflowName);
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
                            const completed = fileAnalysisResults.filter((x) => !x[0] || !(x[0] instanceof WorkflowError));
                            const skipped = fileAnalysisResults.filter((x) => x[0] && x[0] instanceof WorkflowError && (x[0] as WorkflowError).type === "skip");
                            const aborted = fileAnalysisResults.filter((x) => x[0] && x[0] instanceof WorkflowError && (x[0] as WorkflowError).type === "abort");
                            const canceled = fileAnalysisResults.filter((x) => x[0] && x[0] instanceof WorkflowError && (x[0] as WorkflowError).type === "abort");
                            boostLogging.info(`${relativePath} Analysis completed: ${completed.length}`);
                            boostLogging.info(`${relativePath} Analysis skipped: ${skipped.length}`);

                            if (aborted.length > 0) {
                                throw aborted[0];
                            }
                            if (canceled.length > 0) {
                                throw canceled[0];
                            }
                            if (completed.length === 0 && skipped.length > 0) {
                                throw new WorkflowError("skip", `Skipping File ${relativePath} Analysis because all analysis types were skipped`);
                            }

                            return file;
                        };
                        
                        // Name the function dynamically based on the file (to improve logging)
                        Object.defineProperty(fileDynamicFunc, 'name', { value: relativePath, writable: false });
                        
                        return fileDynamicFunc;
                    }
                );
            });
        };
 
        const beforeRun = [
            () => async () => {
                if (BoostConfiguration.simulateServiceCalls) {
                    boostLogging.debug(`Simulate:executeCommand: processProject(${getKernelName(quickBlueprintKernelName)})`);
                } else {
                    this.checkAccountEnabledBeforeContinuingAnalysis();
                    // we want to run blueprint first so we get the excludes and priority list before
                    //   we build the task list for the file rings
                    await vscode.commands.executeCommand(
                        NOTEBOOK_TYPE +
                        "." +
                        BoostCommands.processProject,
                        getKernelName(quickBlueprintKernelName)
                    );
                    this.checkAccountEnabledBeforeContinuingAnalysis();
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
                    await vscode.commands.executeCommand(
                        NOTEBOOK_TYPE + "." + BoostCommands.processCurrentFolder,
                        vscode.Uri.parse(path),
                        getKernelName(summarizeKernelName)
                    );
                    this.checkAccountEnabledBeforeContinuingAnalysis();
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

                const summaryWorkflowName = `${workflowName}-Summarization`;
                for (const [key, value] of this.ringSummaryAnalysisMap) {
                    summaryTasks.push(
                        () => {
                            const dynamicFunc = async () => {
                                if (!analysisTypes.includes(key)) {
                                    throw new WorkflowError("skip", `Skipping Summary Analysis ${key} by user request`);
                                }
                                return this.processQuickSummaryOfRingFileTaskGroup(value);
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
                const completed = summaryResults.filter((x) => !x[0] || !(x[0] instanceof WorkflowError));
                const skipped = summaryResults.filter((x) => x[0] && x[0] instanceof WorkflowError && (x[0] as WorkflowError).type === "skip");
                const aborted = summaryResults.filter((x) => x[0] && x[0] instanceof WorkflowError && (x[0] as WorkflowError).type === "abort");
                const canceled = summaryResults.filter((x) => x[0] && x[0] instanceof WorkflowError && (x[0] as WorkflowError).type === "abort");
                boostLogging.info(`Workflow Analysis Summaries completed: ${completed.length}`);
                boostLogging.info(`Workflow Analysis Summaries skipped: ${skipped.length}`);

                if (aborted.length > 0) {
                    throw aborted[0];
                }
                if (canceled.length > 0) {
                    throw canceled[0];
                }
                if (completed.length === 0 && skipped.length > 0) {
                    throw new WorkflowError("skip", `Skipping Workflow Analysis Summaries because all analysis types were skipped`);
                }
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
                }
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
            name: workflowName,
        });

        try {
            const allResults = await engine.run();
            const completed = allResults.filter((x) => !x[0] || !(x[0] instanceof WorkflowError));
            const skipped = allResults.filter((x) => x[0] && x[0] instanceof WorkflowError && (x[0] as WorkflowError).type === "skip");
            const aborted = allResults.filter((x) => x[0] && x[0] instanceof WorkflowError && (x[0] as WorkflowError).type === "abort");
            const canceled = allResults.filter((x) => x[0] && x[0] instanceof WorkflowError && (x[0] as WorkflowError).type === "abort");
            boostLogging.info(`Overall Workflow File Analysis completed: ${completed.length}`);
            boostLogging.info(`Overall Workflow File Analysis skipped: ${skipped.length}`);

            if (aborted.length > 0) {
                throw aborted[0];
            }
            if (canceled.length > 0) {
                throw canceled[0];
            }

        } finally {
            this.finishAllJobs(this._boostExtension.getBoostProjectData());
            this.refresh();
        }
    }

    private async processDepthOnRingFileTask(
        fileUri: vscode.Uri,
        value: string[],
        workflowName: string) {
        // log the relative path for simplicity for user
        const rootPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath as string;
        const relativePath = path.relative(rootPath, fileUri.fsPath);

        const analysisTypeKernelTasks : any[] = [];
        
        for (const analysisKernelName of value) {
            analysisTypeKernelTasks.push(
                () => {
                    const dynamicFunc = async () => {
                        if (BoostConfiguration.simulateServiceCalls) {
                            boostLogging.debug(`Simulate:executeCommand: processCurrentFolder(${fileUri}, ${analysisKernelName})`);
                            return;
                        }
                        this.checkAccountEnabledBeforeContinuingAnalysis();
                        const refreshed = await vscode.commands.executeCommand(
                            NOTEBOOK_TYPE +
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
        const completed = analysisTypeResults.filter((x) => !x[0] || !(x[0] instanceof WorkflowError));
        const skipped = analysisTypeResults.filter((x) => x[0] && x[0] instanceof WorkflowError && (x[0] as WorkflowError).type === "skip");
        const aborted = analysisTypeResults.filter((x) => x[0] && x[0] instanceof WorkflowError && (x[0] as WorkflowError).type === "abort");
        const canceled = analysisTypeResults.filter((x) => x[0] && x[0] instanceof WorkflowError && (x[0] as WorkflowError).type === "cancel");
        boostLogging.info(`${relativePath} Analysis Kernels completed: ${completed.length}`);
        boostLogging.info(`${relativePath} Analysis Kernels skipped: ${skipped.length}`);

        if (aborted.length > 0) {
            throw aborted[0];
        }
        if (canceled.length > 0) {
            throw canceled[0];
        }
        if (completed.length === 0 && skipped.length > 0) {
            throw new WorkflowError("skip", `Skipping Analysis Kernels because all analysis types were skipped`);
        }
    }

    private async processQuickSummaryOfRingFileTaskGroup(value: string[]) {
        for (const analysisKernelName of value) {
            if (BoostConfiguration.simulateServiceCalls) {
                boostLogging.debug(`Simulate:executeCommand: processProject(${analysisKernelName})`);
                continue;
            }
            this.checkAccountEnabledBeforeContinuingAnalysis();
            await vscode.commands.executeCommand(
                NOTEBOOK_TYPE +
                "." +
                BoostCommands.processProject,
                analysisKernelName
            );
            this.checkAccountEnabledBeforeContinuingAnalysis();
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
            this.checkAccountEnabledBeforeContinuingAnalysis();

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
                this.checkAccountEnabledBeforeContinuingAnalysis();
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
                this.checkAccountEnabledBeforeContinuingAnalysis();
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
                this.checkAccountEnabledBeforeContinuingAnalysis();
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
            { format: BoostFileType.summary }
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
