import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as _ from 'lodash';
import { BoostExtension } from './extension';


export class BoostSummaryViewProvider implements vscode.WebviewViewProvider {

	public static readonly viewType = 'polyverse-boost-summary-view';

	private _view?: vscode.WebviewView;

	constructor(
		private readonly context: vscode.ExtensionContext,
		private _boostExtension: BoostExtension
	) { }

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		this._view = webviewView;

		const boostdata = {
			summary: [
				{
					analysis: "Blueprint",
					status: "completed",
					completed: "3",
					total: "6",
				},
				{
					analysis: "Documentation",
					status: "incomplete",
					completed: "3",
					total: "6",
				},
				{
					analysis: "Security Scan",
					status: "processing",
					completed: "3",
					total: "6",
				},
				{
					analysis: "Compliance Scan",
					status: "not-started",
					completed: "3",
					total: "6",
				}
			],
			security: [
				{ severity: "Critical", count: "3" },
			]
		};

		webviewView.webview.options = {
			// Allow scripts in the webview
			enableScripts: true,

			localResourceRoots: [
				this.context.extensionUri
			]
		};

		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview, boostdata);

		webviewView.webview.onDidReceiveMessage(data => {
			switch (data.type) {
				case 'refresh':
					{
						vscode.window.activeTextEditor?.insertSnippet(new vscode.SnippetString(`#${data.value}`));
						break;
					}
			}
		});
	}

	public refresh() {
		if (this._view) {
			this._view.show?.(true);
			this._view.webview.postMessage({ type: 'refresh' });
		}
	}

    private _getHtmlForWebview(webview: vscode.Webview, boostdata: any) {

        const htmlPathOnDisk = vscode.Uri.joinPath(this.context.extensionUri, 'resources', 'dashboard', 'summary.html');
		const jsPathOnDisk = vscode.Uri.joinPath(this.context.extensionUri, 'out', 'dashboard', 'summary', 'main.js');
        const jsSrc = webview.asWebviewUri(jsPathOnDisk);
		const nonce = 'nonce-123456'; // TODO: add a real nonce here
        const rawHtmlContent = fs.readFileSync(htmlPathOnDisk.fsPath, 'utf8');
    
        const template = _.template(rawHtmlContent);
        const htmlContent = template({ jsSrc, nonce, boostdata });
    
        return htmlContent;
    }
}
