import * as vscode from 'vscode';
import * as fs from 'fs';
import * as _ from 'lodash';
import { BoostExtension } from './BoostExtension';
import { getOrCreateBlueprintUri, BoostCommands, getKernelName} from './extension';



export class BoostStartViewProvider implements vscode.WebviewViewProvider {

	public static readonly viewType = 'polyverse-boost-start-view';

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

		const boostdata = this._boostExtension.getBoostProjectData();

		webviewView.webview.options = {
			// Allow scripts in the webview
			enableScripts: true,

			localResourceRoots: [
				this.context.extensionUri
			]
		};

		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview, boostdata);

		webviewView.webview.onDidReceiveMessage(async data => {
			switch (data.command) {
				case 'open_file':
					{
						const path = data.file;
						const blueprintUri = await getOrCreateBlueprintUri(this.context, path);
						const document = await vscode.workspace.openNotebookDocument(blueprintUri);
						await vscode.window.showNotebookDocument(document);
					}
					break;

				case 'show_summary':
					{
						vscode.commands.executeCommand('polyverse-boost-summary-view.focus');
					}
					break;
			}
		});
	}

	public refresh() {
		if (this._view) {
			this._view.webview.html = this._getHtmlForWebview(this._view.webview, this._boostExtension.getBoostProjectData());
			this._view.show?.(true);
		}
	}

    private _getHtmlForWebview(webview: vscode.Webview, boostdata: any) {

        const htmlPathOnDisk = vscode.Uri.joinPath(this.context.extensionUri, 'resources', 'dashboard', 'start.html');
		const jsPathOnDisk = vscode.Uri.joinPath(this.context.extensionUri, 'out', 'dashboard', 'start', 'main.js');
        const jsSrc = webview.asWebviewUri(jsPathOnDisk);
		const nonce = 'nonce-123456'; // TODO: add a real nonce here
        const rawHtmlContent = fs.readFileSync(htmlPathOnDisk.fsPath, 'utf8');
		
		const blueprintFile = boostdata.summary.summaryUrl; 


        const template = _.template(rawHtmlContent);
        const htmlContent = template({ jsSrc, nonce, boostdata, blueprintFile});
    
        return htmlContent;
    }
}
