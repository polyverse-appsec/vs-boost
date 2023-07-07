import * as vscode from "vscode";
import * as fs from "fs";
import * as _ from "lodash";
import { BoostExtension } from "./BoostExtension";

import { BoostCommands, getKernelName } from "./extension";
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
import { FileSummaryItem } from "./boostprojectdata_interface";
import { quickBlueprintKernelName } from "./quick_blueprint_controller";
import { performanceKernelName } from "./performance_controller";
import { performanceFunctionKernelName } from "./performance_function_controller";

export const summaryViewType = "polyverse-boost-summary-view";

export class BoostSummaryViewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;

    constructor(
        private readonly context: vscode.ExtensionContext,
        private _boostExtension: BoostExtension
    ) {}

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

        const boostprojectdata = this._boostExtension.getBoostProjectData();

        webviewView.webview.options = {
            // Allow scripts in the webview
            enableScripts: true,

            localResourceRoots: [this.context.extensionUri],
        };

        webviewView.webview.html = this._getHtmlForWebview(
            webviewView.webview,
            boostprojectdata
        );

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.command) {
                case "analyze_all":
                    {
                        let runSummary = false;

                        // creates and loads all notebook files
                        await vscode.commands.executeCommand(
                            NOTEBOOK_TYPE +
                                "." +
                                BoostCommands.loadCurrentFolder,
                            undefined
                        );

                        // refresh project data
                        await vscode.commands.executeCommand(
                            NOTEBOOK_TYPE +
                                "." +
                                BoostCommands.refreshProjectData
                        );

                        const analysisMap = new Map([
                            [
                                "documentation",
                                [
                                    getKernelName(quickBlueprintKernelName),
                                    getKernelName(explainKernelName),
                                    getKernelName(flowDiagramKernelName),
                                ],
                            ],
                            [
                                "security",
                                [
                                    getKernelName(analyzeFunctionKernelName),
//                                    getKernelName(performanceFunctionKernelName),
                                ],

                            ],
                            [
                                "compliance",
                                [
                                    getKernelName(complianceFunctionKernelName),
                                ],
                            ],
                            [
                                "deepcode",
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
                                if (!data.analysisTypes.includes(key)) {
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

                                        // quick blueprint uses the project-level command
                                        if (analysisKernelName === getKernelName(quickBlueprintKernelName)) {
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
                                    runSummary = true;
                                } catch (error) {
                                    boostLogging.error(
                                        `Error while running ${key} analysis:: ${error}`,
                                        true
                                    );
                                }
                                // refresh project data
                                await vscode.commands.executeCommand(
                                    NOTEBOOK_TYPE +
                                        "." +
                                        BoostCommands.refreshProjectData
                                );
                            }
                            /*
                            if ((runSummary &&
                                // don't run summary if dev overrode it, or requested it specifically
                                !BoostConfiguration.runAllTargetAnalysisType) ||
                                (BoostConfiguration.runAllTargetAnalysisType &&
                                (BoostConfiguration.runAllTargetAnalysisType as string).includes(summarizeKernelName))) {

                                // summary across all files
                                await vscode.commands.executeCommand(NOTEBOOK_TYPE + '.' + BoostCommands.processCurrentFolder, undefined, );
                            }
*/
                        } finally {
                            // refresh project data
                            await vscode.commands.executeCommand(
                                NOTEBOOK_TYPE +
                                    "." +
                                    BoostCommands.refreshProjectData
                            );
                            this.finishAllJobs(boostprojectdata);
                            this.refresh();
                        }
                    }

                    break;
                case "update_summary": {
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
                    // await vscode.commands.executeCommand(NOTEBOOK_TYPE + '.' + BoostCommands.processCurrentFolder, undefined, getKernelName(summarizeKernelName));
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

    private _getHtmlForWebview(webview: vscode.Webview, boostprojectdata: BoostProjectData) {
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

        const template = _.template(rawHtmlContent);
        const htmlContent = template({ jsSrc, nonce, boostprojectdata });

        return htmlContent;
    }


    public addJobs(job: string, files: [string], boostprojectdata: BoostProjectData) {
        //if this._jobs[jobs] exists, add count to it, otherwise set it to count
        boostprojectdata.addJobs(job, files); 
        const payload = {
            command: "refreshUI",
            boostprojectdata: boostprojectdata,
            error: null
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
        const payload = {
            command: "finishAllJobs",
            boostprojectdata: boostprojectdata,
        };
        this._view?.webview.postMessage(payload);
    }

    public addQueue(job: string, files: [string], boostprojectdata: BoostProjectData) {
        const payload = {
            command: "refreshUI",
            boostprojectdata: boostprojectdata,
            error: null
        };
        this._view?.webview.postMessage(payload);
    }
}
