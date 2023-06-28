import * as vscode from 'vscode';
import * as fs from 'fs';
import * as _ from 'lodash';
import { BoostExtension } from './BoostExtension';

import { BoostCommands, getKernelName } from './extension';
import { NOTEBOOK_TYPE } from './jupyter_notebook';

import { summarizeKernelName } from './summary_controller';
import { analyzeKernelName } from './analyze_controller';
import { analyzeFunctionKernelName } from './analyze_function_controller';
import { complianceKernelName } from './compliance_controller';
import { blueprintKernelName } from './blueprint_controller';
import { flowDiagramKernelName } from './flowdiagram_controller';
import { explainKernelName } from './explain_controller';
import { boostLogging } from './boostLogging';
import { BoostConfiguration } from './boostConfiguration';
import { complianceFunctionKernelName } from './compliance_function_controller';

export const summaryViewType = 'polyverse-boost-summary-view';

export class BoostSummaryViewProvider implements vscode.WebviewViewProvider {

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

                          const analysisMap = new Map([
                            ['archblueprintCode', [getKernelName(blueprintKernelName)]],
                            ['explainCode', [getKernelName(explainKernelName), getKernelName(flowDiagramKernelName)]],
                            ['bugAnalysis', [getKernelName(analyzeKernelName), getKernelName(analyzeFunctionKernelName)]],
                            ['complianceCode', [getKernelName(complianceKernelName), getKernelName(complianceFunctionKernelName)]]
                          ]);

                        try {
                            for (const [key, value] of analysisMap) {
                                if (!data.analysisTypes.includes(key)) {
                                    continue;
                                }
                                if (BoostConfiguration.runAllTargetAnalysisType &&
                                    !((BoostConfiguration.runAllTargetAnalysisType as string).includes(key))) {
                                    continue;
                                }
                                try {
                                    for (const analysisKernelName of value) {
                                        if (BoostConfiguration.runAllTargetAnalysisType &&
                                            !((BoostConfiguration.runAllTargetAnalysisType as string).includes(analysisKernelName))) {
                                            continue;
                                        }

                                        await vscode.commands.executeCommand(
                                            NOTEBOOK_TYPE + '.' + BoostCommands.processCurrentFolder,
                                            undefined,
                                            analysisKernelName
                                            );
                                     }
                                    runSummary = true;
                                } catch (error) {
                                    boostLogging.error(`Error while running ${key} analysis:: ${error}`, true);
                                }
                                // refresh project data
                                await vscode.commands.executeCommand(NOTEBOOK_TYPE + '.' + BoostCommands.refreshProjectData);
                            }

                            if ((runSummary &&
                                // don't run summary if dev overrode it, or requested it specifically
                                !BoostConfiguration.runAllTargetAnalysisType) ||
                                (BoostConfiguration.runAllTargetAnalysisType &&
                                (BoostConfiguration.runAllTargetAnalysisType as string).includes(summarizeKernelName))) {

                                // summary across all files
                                await vscode.commands.executeCommand(NOTEBOOK_TYPE + '.' + BoostCommands.processCurrentFolder, undefined, getKernelName(summarizeKernelName));
                            }
                        } finally {
                            // refresh project data
                            await vscode.commands.executeCommand(NOTEBOOK_TYPE + '.' + BoostCommands.refreshProjectData);
							this.finishAllJobs();
                            this.refresh();
                        }
                    }

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

	public addJobs(job: string, files: [string], count: number) {
		//if this._jobs[jobs] exists, add count to it, otherwise set it to count
		this._jobs[job] ? this._jobs[job] += count : this._jobs[job] = count;
		const payload = {
			command: 'addJobs',
			job: job,
			files: files,
			count: this._jobs[job]
		};
		this._view?.webview.postMessage(payload);
	}

	public finishJobs(job: string, files: [string], error: Error | null, count: number) {
		//if this._jobs[jobs] exists, add count to it, otherwise set it to zero 
		//(somehow we finished a job that was never counted as being started)
		this._jobs[job] ? this._jobs[job] -= count : 0;
		const payload = {
			command: 'finishJobs',
			job: job,
			files: files,
			error: error,
			count: this._jobs[job]
		};
		this._view?.webview.postMessage(payload);
	}

	public finishAllJobs() {
		this._jobs = {};
		const payload = {
			command: 'finishAllJobs'
		};
		this._view?.webview.postMessage(payload);
	}

	public addQueue(job: string, files: [string], ms: number) {
		const payload = {
			command: 'addQueue',
			file: files,
			ms: ms,
			job: job
		};
		this._view?.webview.postMessage(payload);
	}

	public updateStatus(status: string) {
		const payload = {
			command: 'updateStatus',
			status: status
		};
		this._view?.webview.postMessage(payload);
	}
}
