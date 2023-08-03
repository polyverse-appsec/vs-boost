import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as _ from "lodash";
import { BoostExtension } from "./BoostExtension";
import { aiName } from "./chat_view";

import {
    BoostCommands,
    getKernelName,
    ProcessCurrentFolderOptions,
} from "./extension";
import { NOTEBOOK_TYPE } from "./jupyter_notebook";

import { summarizeKernelName } from "./summary_controller";
import { analyzeKernelName } from "./analyze_controller";
import { analyzeFunctionKernelName } from "./analyze_function_controller";
import { complianceKernelName } from "./compliance_controller";
import { blueprintKernelName } from "./blueprint_controller";
import { flowDiagramKernelName } from "./flowdiagram_controller";
import { explainKernelName } from "./explain_controller";
import { boostLogging } from "./boostLogging";
import { BoostConfiguration } from "./boostConfiguration";
import { complianceFunctionKernelName } from "./compliance_function_controller";
import { BoostProjectData } from "./BoostProjectData";
import {
    FileSummaryItem,
    noProjectOpenMessage,
    extensionNotFullyActivated,
    extensionFailedToActivate,
} from "./boostprojectdata_interface";
import { quickBlueprintKernelName } from "./quick_blueprint_controller";
import { performanceKernelName } from "./performance_controller";
import { BoostUserAnalysisType } from "./userAnalysisType";
import { quickComplianceSummaryKernelName } from "./quick_compliance_summary_controller";
import { quickSecuritySummaryKernelName } from "./quick_security_summary_controller";
import { marked } from "marked";
import { BoostFileType, findCellByKernel, getBoostFile } from "./extension";
import { BoostNotebook, BoostNotebookCell } from "./jupyter_notebook";
import { ControllerOutputType } from "./controllerOutputTypes";
import { getOrCreateBlueprintUri, getOrCreateGuideline } from "./extension";
import * as boostnb from "./jupyter_notebook";

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
                        await this.analyzeAll(data.analysisTypes);
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
        job: string,
        files: [string],
        boostprojectdata: BoostProjectData
    ) {
        boostprojectdata.addQueue(job, files);
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

    private async analyzeAll(analysisTypes: string[]) {
        let runSummary = false;

        // creates and loads all notebook files
        await vscode.commands.executeCommand(
            NOTEBOOK_TYPE + "." + BoostCommands.loadCurrentFolder,
            undefined
        );

        // refresh project data
        await vscode.commands.executeCommand(
            NOTEBOOK_TYPE + "." + BoostCommands.refreshProjectData
        );

        const analysisMap = new Map([
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
                    //                                    getKernelName(performanceFunctionKernelName),
                    //                                    getKernelName(quickPerformanceSummaryKernelName),
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

        try {
            for (const [key, value] of analysisMap) {
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
                    for (const analysisKernelName of value) {
                        if (
                            BoostConfiguration.runAllTargetAnalysisType &&
                            !(
                                BoostConfiguration.runAllTargetAnalysisType as string
                            ).includes(analysisKernelName)
                        ) {
                            continue;
                        }

                        // quick operations uses the project-level command
                        if (
                            [
                                getKernelName(quickBlueprintKernelName),
                                getKernelName(quickComplianceSummaryKernelName),
                                getKernelName(quickSecuritySummaryKernelName),
                            ].includes(analysisKernelName)
                        ) {
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
                                undefined,
                                analysisKernelName
                            );
                        }
                    }

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
                cellmd = `${value} summary not yet run - please run "Run Selected Analyses" to generate content`;
            }
            //if the cell markdown starts with Error
            if (cellmd.startsWith("Error:")) {
                cellmd =
                    `***Error Building ${value} Summary***\n\n` +
                    `Please review below error, then run "Run Selected Analyses" to regenerate Summary data\n\n` +
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

        // summary across all files
        await vscode.commands.executeCommand(
            NOTEBOOK_TYPE + "." + BoostCommands.processCurrentFolder,
            undefined,
            getKernelName(summarizeKernelName)
        );

        // refresh project data
        await vscode.commands.executeCommand(
            NOTEBOOK_TYPE + "." + BoostCommands.refreshProjectData
        );
    }
}
