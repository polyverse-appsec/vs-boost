import * as vscode from 'vscode';
import * as fs from 'fs';
import * as _ from 'lodash';
import { BoostExtension } from './BoostExtension';
import { getOrCreateBlueprintUri, getOrCreateGuideline, getBoostFile, BoostFileType } from './extension';
import { boostLogging } from './boostLogging';
import { summaryViewType } from './summary_view';
import { aiName } from './chat_view';


export class BoostStartViewProvider implements vscode.WebviewViewProvider {

    public static readonly viewType = 'polyverse-boost-start-view';

    private _view?: vscode.WebviewView;

    constructor(
        private readonly context: vscode.ExtensionContext,
        private _boostExtension: BoostExtension
    ) { }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        try {
            this._resolveWebviewView(webviewView, _, _token);
        } catch (e) {
            boostLogging.error(`Could not load Boost Start View due to ${e}`, false);
        }
    }

    _resolveWebviewView(
        webviewView: vscode.WebviewView,
        _: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        const boostprojectdata = this._boostExtension.getBoostProjectData();

        webviewView.webview.options = {
            // Allow scripts in the webview
            enableScripts: true,

            localResourceRoots: [
                this.context.extensionUri
            ]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview, boostprojectdata);

        webviewView.webview.onDidReceiveMessage(async data => {
            switch (data.command) {
                case 'open_file':
                    {
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
                targetNotebookUri = await getOrCreateBlueprintUri(this.context, filename);
            } else {
                targetNotebookUri = getBoostFile(undefined, BoostFileType.guidelines);
                getOrCreateGuideline(targetNotebookUri, BoostFileType.guidelines);
            }
            const document = await vscode.workspace.openNotebookDocument(targetNotebookUri as vscode.Uri);
            await vscode.window.showNotebookDocument(document);
    } catch (e) {
            boostLogging.error(`Could not open Boost Project Summary ${filename} due to ${e}`, true);
        }
    }

    public refresh() {
        try {
            this._refresh();
        } catch (e) {
            boostLogging.error(`Could not refresh Boost Start View due to ${e}`, false);
        }
    }

    _refresh() {
        if (this._view) {
            this._view.webview.html = this._getHtmlForWebview(this._view.webview, this._boostExtension.getBoostProjectData());
            this._view.show?.(true);
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview, boostprojectdata: any) {

        const htmlPathOnDisk = vscode.Uri.joinPath(this.context.extensionUri, 'resources', 'dashboard', 'start.html');
        const jsPathOnDisk = vscode.Uri.joinPath(this.context.extensionUri, 'out', 'dashboard', 'start', 'main.js');
        const jsSrc = webview.asWebviewUri(jsPathOnDisk);
        const nonce = 'nonce-123456'; // TODO: add a real nonce here
        const rawHtmlContent = fs.readFileSync(htmlPathOnDisk.fsPath, 'utf8');

        const blueprintFile = boostprojectdata.summary.summaryUrl;
        const guidelinesFile = getBoostFile(undefined, BoostFileType.guidelines, false).fsPath;

        const template = _.template(rawHtmlContent);
        const htmlContent = template({ jsSrc, nonce, boostprojectdata, blueprintFile, guidelinesFile, aiName });

        return htmlContent;
    }
}
