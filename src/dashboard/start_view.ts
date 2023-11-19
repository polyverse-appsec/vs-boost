import * as vscode from 'vscode';
import * as fs from 'fs';
import * as _ from 'lodash';
import {
    getOrCreateBlueprintUri,
    getOrCreateGuideline,
    getBoostFile,
    BoostFileType
} from '../extension/extension';
import { boostLogging } from '../utilities/boostLogging';
import { summaryViewType } from './summary_view';
import { aiName } from '../data/ChatData';


import { BaseWebviewViewProvider } from './BaseWebviewViewProvider';

export class BoostStartViewProvider extends BaseWebviewViewProvider {

    constructor(context: vscode.ExtensionContext,
                boostExtension: any
    ) {
        super(context, boostExtension, "Start");
    }

    public static readonly viewType = 'polyverse-boost-start-view';

    _resolveWebviewView(
        webviewView: vscode.WebviewView,
        _: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        super._resolveWebviewView(webviewView, _, _token);

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview, this._boostExtension.getBoostProjectData());

        webviewView.webview.onDidReceiveMessage(async data => {
            switch (data.command) {
                case 'open_file':
                    {
                        const boostprojectdata = this._boostExtension.getBoostProjectData();
                        
                        await this._openFile(data.file, boostprojectdata);
                    }
                    break;

                case 'show_summary':
                    {
                        vscode.commands.executeCommand(`${summaryViewType}.focus`);
                    }
                    break;
            }
        });
    }

    private async _openFile(filename: string, boostprojectdata : any) {
        try {
            let targetNotebookUri;
            if (filename === boostprojectdata.summary.summaryUrl) {
                targetNotebookUri = await getOrCreateBlueprintUri(this._context, filename);
            } else {
                targetNotebookUri = getBoostFile(undefined, { format: BoostFileType.guidelines });
                getOrCreateGuideline(targetNotebookUri, BoostFileType.guidelines);
            }
            const document = await vscode.workspace.openNotebookDocument(targetNotebookUri as vscode.Uri);
            await vscode.window.showNotebookDocument(document);
    } catch (e) {
            boostLogging.error(`Could not open Boost Project Summary ${filename} due to ${e}`, true);
        }
    }

    protected _getHtmlForWebview(webview: vscode.Webview, boostprojectdata: any) : string {
        const message = super._getHtmlForWebview(webview, boostprojectdata);
        if (message) {
            return message;
        }

        const htmlPathOnDisk = vscode.Uri.joinPath(this._context.extensionUri, 'resources', 'dashboard', 'start.html');
        const jsPathOnDisk = vscode.Uri.joinPath(this._context.extensionUri, 'out', 'dashboard', 'start', 'main.js');
        const jsSrc = webview.asWebviewUri(jsPathOnDisk);
        const nonce = this.getNonce();

        const rawHtmlContent = fs.readFileSync(htmlPathOnDisk.fsPath, 'utf8');

        const blueprintFile = boostprojectdata.summary.summaryUrl;
        const guidelinesFile = getBoostFile(undefined, { format: BoostFileType.guidelines, showUI: false }).fsPath;

        const template = _.template(rawHtmlContent);
        const htmlContent = template({ jsSrc, nonce, boostprojectdata, blueprintFile, guidelinesFile, aiName });

        return htmlContent;
    }
}
