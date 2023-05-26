import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';


export class BoostDashboardProvider implements vscode.WebviewViewProvider {

	public static readonly viewType = 'polyverse-boost-dash-view';

	private _view?: vscode.WebviewView;

	constructor(
		private readonly _extensionUri: vscode.Uri,
	) { }

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		this._view = webviewView;

		webviewView.webview.options = {
			// Allow scripts in the webview
			enableScripts: true,

			localResourceRoots: [
				this._extensionUri
			]
		};

		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

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

	private _getHtmlForWebview(webview: vscode.Webview) {
		const htmlPathOnDisk = vscode.Uri.joinPath(this._extensionUri, 'resources', 'dashboard.html');
		const htmlContent = fs.readFileSync(htmlPathOnDisk.fsPath, 'utf8');
		return htmlContent;
	}
}
