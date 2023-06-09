import * as vscode from 'vscode';
import * as fs from 'fs';
import * as _ from 'lodash';
import { BoostExtension } from './BoostExtension';
import { getOrCreateBlueprintUri, BoostCommands} from './extension';
import { NOTEBOOK_TYPE } from './jupyter_notebook';

import { summarizeKernelName } from './summary_controller';
import { analyzeKernelName } from './analyze_controller';
import { complianceKernelName } from './compliance_controller';
import { blueprintKernelName } from './blueprint_controller';
import { flowDiagramKernelName } from './flowdiagram_controller';
import { explainKernelName } from './explain_controller';


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
				case 'analyze_all':
					{
                        // creates and loads all notebook files
                        await vscode.commands.executeCommand(NOTEBOOK_TYPE + '.' + BoostCommands.loadCurrentFolder, undefined);

                        // blueprint
                        await vscode.commands.executeCommand(NOTEBOOK_TYPE + '.' + BoostCommands.processCurrentFolder, undefined, getKernelName(blueprintKernelName));

                        // explain
                        await vscode.commands.executeCommand(NOTEBOOK_TYPE + '.' + BoostCommands.processCurrentFolder, undefined, GetKernelName(explainKernelName));

                        // security / bug analysis
                        await vscode.commands.executeCommand(NOTEBOOK_TYPE + '.' + BoostCommands.processCurrentFolder, undefined, GetKernelName(analyzeKernelName));

                        // compliance
                        await vscode.commands.executeCommand(NOTEBOOK_TYPE + '.' + BoostCommands.processCurrentFolder, undefined, GetKernelName(complianceKernelName));

                        // flow diagram
                        await vscode.commands.executeCommand(NOTEBOOK_TYPE + '.' + BoostCommands.processCurrentFolder, undefined, getKernelName(flowDiagramKernelName));

                        // summary across all files
                        await vscode.commands.executeCommand(NOTEBOOK_TYPE + '.' + BoostCommands.processCurrentFolder, undefined, summarizeKernelName);
					}
				case 'open_file':
					{
						const path = data.file;
						const blueprintUri = await getOrCreateBlueprintUri(this.context, path);
						const document = await vscode.workspace.openTextDocument(blueprintUri);
						await vscode.window.showTextDocument(document);
					}
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
