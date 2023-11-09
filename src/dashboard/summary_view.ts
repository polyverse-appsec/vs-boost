import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as _ from "lodash";

import { BoostExtension } from "../extension/BoostExtension";
import { aiName } from "../data/ChatData";

import { getKernelName } from "../extension/extensionUtilities";

import { NOTEBOOK_TYPE } from "../data/jupyter_notebook";

import { summarizeKernelName } from "../controllers/summary_controller";
import { boostLogging } from "../utilities/boostLogging";
import { BoostConfiguration } from "../extension/boostConfiguration";
import { BoostProjectData } from "../data/BoostProjectData";
import {
    FileSummaryItem,
} from "../data/boostprojectdata_interface";
import { DisplayGroupFriendlyName } from "../data/userAnalysisType";
import { marked } from "marked";
import {
    BoostFileType,
    findCellByKernel,
    getBoostFile,
    BoostCommands,
} from "../extension/extension";
import { BoostNotebook, BoostNotebookCell } from "../data/jupyter_notebook";
import { ControllerOutputType } from "../controllers/controllerOutputTypes";
import { getOrCreateBlueprintUri, getOrCreateGuideline } from "../extension/extension";
import * as boostnb from "../data/jupyter_notebook";
import { BaseWebviewViewProvider } from "./BaseWebviewViewProvider";

export const summaryViewType = "polyverse-boost-summary-view";

export class BoostSummaryViewProvider extends BaseWebviewViewProvider {

    constructor(context: vscode.ExtensionContext,
                boostExtension: BoostExtension
    ) {
        super(context, boostExtension, "Summary");
    }

    async _resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        super._resolveWebviewView(webviewView, context, _token);

        webviewView.webview.html = this._getHtmlForWebview(
            webviewView.webview,
            this._boostExtension.getBoostProjectData()!
        );

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.command) {
                case "refreshUI":
                    {
                        const boostprojectdata = this._boostExtension.getBoostProjectData()!;
                        const payload = {
                            command: "refreshUI",
                            boostprojectdata: boostprojectdata,
                        };
                        this._view?.webview.postMessage(payload);
                    }
                    break;
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
                case "analysis_type_changed":
                    {
                        const boostProjectData = this._boostExtension.getBoostProjectData()!;
                        boostProjectData.toggleAnalysisTypeEnabled(data.analysisType, data.checked);
                        boostProjectData.flushToFS();

                        // we need to queue a UI refresh since we just queued a checkbox change
                        //     we need to refresh UI AFTER the checkbox change is processed
                        const payload = {
                            command: "refreshUI",
                            boostprojectdata: boostProjectData,
                        };
                        this._view?.webview.postMessage(payload);
                    }
                    break;
                case "analyze_mode_changed":
                    {
                        const boostProjectData = this._boostExtension.getBoostProjectData()!;
                        boostProjectData.setAnalysisMode(data.choice);
                        boostProjectData.flushToFS();
                        const payload = {
                            command: "refreshUI",
                            boostprojectdata: boostProjectData,
                        };
                        this._view?.webview.postMessage(payload);
                    }
                    break;
                case "refresh_deep_summary": {
                    await this.refreshDeepSummary();
                }
            }
        });
    }

    protected _getHtmlForWebview(
        webview: vscode.Webview,
        boostprojectdata: BoostProjectData
    ) {
        const message = super._getHtmlForWebview(webview, boostprojectdata);
        if (message) {
            return message;
        }

        const htmlPathOnDisk = vscode.Uri.joinPath(
            this._context.extensionUri,
            "resources",
            "dashboard",
            "summary.html"
        );
        const jsPathOnDisk = vscode.Uri.joinPath(
            this._context.extensionUri,
            "out",
            "dashboard",
            "summary",
            "main.js"
        );
        const jsSrc = webview.asWebviewUri(jsPathOnDisk);
        const nonce = "nonce-123456"; // TODO: add a real nonce here
        const rawHtmlContent = fs.readFileSync(htmlPathOnDisk.fsPath, "utf8");

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
                this._context,
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
        try {
            await vscode.commands.executeCommand(
                NOTEBOOK_TYPE + "." + BoostCommands.processAllFilesInRings,
                {
                    analysisTypes: analysisTypes,
                    fileLimit: fileLimit,
                    showUI: true,
                });
        } catch (e) {
            boostLogging.error(`Run Selected Analysis failed: ${e}`, true);
        }
    }

    private _getMarkdownForSummaries(): { [key: string]: string } {
        let markdown = {} as { [key: string]: string };
        if (!this._view?.webview) {
            return {};
        }

        const userFriendlyNames = {
            [ControllerOutputType.blueprint]: DisplayGroupFriendlyName.documentation,
            [ControllerOutputType.analyze]: DisplayGroupFriendlyName.security,
            [ControllerOutputType.compliance]: DisplayGroupFriendlyName.compliance,
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
