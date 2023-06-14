import * as vscode from 'vscode';
import * as fs from 'fs';
import * as _ from 'lodash';
import { BoostExtension } from './BoostExtension';

import { BoostCommands, getKernelName } from './extension';
import { NOTEBOOK_TYPE } from './jupyter_notebook';

import { summarizeKernelName } from './summary_controller';
import { analyzeKernelName } from './analyze_controller';
import { complianceKernelName } from './compliance_controller';
import { blueprintKernelName } from './blueprint_controller';
import { flowDiagramKernelName } from './flowdiagram_controller';
import { explainKernelName } from './explain_controller';

export class BoostSummaryViewProvider implements vscode.WebviewViewProvider {

	public static readonly viewType = 'polyverse-boost-summary-view';

	private _view?: vscode.WebviewView;

	private _jobs: any = {};
	private _currentJob: any = {};

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
						let runSummary = false;
                        // creates and loads all notebook files
                        await vscode.commands.executeCommand(NOTEBOOK_TYPE + '.' + BoostCommands.loadCurrentFolder, undefined);

                        // refresh project data
                        await vscode.commands.executeCommand(NOTEBOOK_TYPE + '.' + BoostCommands.refreshProjectData);

						if( data.analysisTypes.includes('archblueprintCode') ) {
							
							// blueprint
							await vscode.commands.executeCommand(NOTEBOOK_TYPE + '.' + BoostCommands.processCurrentFolder, undefined, getKernelName(blueprintKernelName));

							// refresh project data
							await vscode.commands.executeCommand(NOTEBOOK_TYPE + '.' + BoostCommands.refreshProjectData);
							runSummary = true;
						}

						if( data.analysisTypes.includes('explainCode') ) {

							// explain
							await vscode.commands.executeCommand(NOTEBOOK_TYPE + '.' + BoostCommands.processCurrentFolder, undefined, getKernelName(explainKernelName));
							// flow diagram
							await vscode.commands.executeCommand(NOTEBOOK_TYPE + '.' + BoostCommands.processCurrentFolder, undefined, getKernelName(flowDiagramKernelName));

							// refresh project data
							await vscode.commands.executeCommand(NOTEBOOK_TYPE + '.' + BoostCommands.refreshProjectData);
						
							runSummary = true;
						}

						if( data.analysisTypes.includes('bugAnalysis') ) {

                        	// security / bug analysis
                        	await vscode.commands.executeCommand(NOTEBOOK_TYPE + '.' + BoostCommands.processCurrentFolder, undefined, getKernelName(analyzeKernelName));

                        	// refresh project data
                        	await vscode.commands.executeCommand(NOTEBOOK_TYPE + '.' + BoostCommands.refreshProjectData);
						
							runSummary = true;
						}

						if( data.analysisTypes.includes('complianceCode') ) {
                        	// compliance
                        	await vscode.commands.executeCommand(NOTEBOOK_TYPE + '.' + BoostCommands.processCurrentFolder, undefined, getKernelName(complianceKernelName));

                        	// refresh project data
                        	await vscode.commands.executeCommand(NOTEBOOK_TYPE + '.' + BoostCommands.refreshProjectData);

							runSummary = true;
						}

						if( runSummary ) {
                        	// summary across all files
                        	await vscode.commands.executeCommand(NOTEBOOK_TYPE + '.' + BoostCommands.processCurrentFolder, undefined, getKernelName(summarizeKernelName));
						}
					}
					this.refresh();
					break;
				case 'update_summary':
					{
                        // creates and loads all notebook files
                        await vscode.commands.executeCommand(NOTEBOOK_TYPE + '.' + BoostCommands.loadCurrentFolder, undefined);

                        // refresh project data
                        await vscode.commands.executeCommand(NOTEBOOK_TYPE + '.' + BoostCommands.refreshProjectData);

                        // summary across all files
                        // await vscode.commands.executeCommand(NOTEBOOK_TYPE + '.' + BoostCommands.processCurrentFolder, undefined, getKernelName(summarizeKernelName));
					}
			}
		});
	}

	public refresh() {
		if (this._view) {
			this._jobs = {};
			this._view.webview.html = this._getHtmlForWebview(this._view.webview, this._boostExtension.getBoostProjectData());
			this._view.show?.(true);
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

	public addJobs(job: string, count: number) {
		//if this._jobs[jobs] exists, add count to it, otherwise set it to count
		this._jobs[job] ? this._jobs[job] += count : this._jobs[job] = count;
		const payload = {
			command: 'addJobs',
			job: job,
			count: this._jobs[job]
		};
		this._view?.webview.postMessage(payload);
	}

	public finishJobs(job: string, count: number) {
		//if this._jobs[jobs] exists, add count to it, otherwise set it to zero 
		//(somehow we finished a job that was never counted as being started)
		this._jobs[job] ? this._jobs[job] -= count : 0;
		const payload = {
			command: 'finishJobs',
			job: job,
			count: this._jobs[job]
		};
		this._view?.webview.postMessage(payload);
	}

	//so far, this is not a very useful function.  consider removing it.  all of the jobs are queued up more
	//or less all at once.  so there really isn't a "current" job. 
	public currentJob(job: string, path: string) {
		//if this._jobs[jobs] exists, add count to it, otherwise set it to zero 
		//(somehow we finished a job that was never counted as being started)
		this._currentJob = {
			job: job,
			path: path
		};
		this.refresh();
	}
}
