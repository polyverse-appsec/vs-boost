import * as vscode from 'vscode';
import * as fs from 'fs';
import * as _ from 'lodash';
import { BoostExtension } from './BoostExtension';
import {marked} from 'marked';
import { BoostFileType, findCellByKernel, getBoostFile } from './extension';
import { BoostNotebook, BoostNotebookCell } from './jupyter_notebook';

import { analyzeOutputType } from './analyze_controller';
import { complianceOutputType } from './compliance_controller';
import { blueprintOutputType } from './blueprint_controller';
import { explainOutputType } from './explain_controller';



export class BoostMarkdownViewProvider implements vscode.WebviewViewProvider {

	public static readonly viewType = 'polyverse-boost-markdown-view';

	private _view?: vscode.WebviewView;
	private _context: vscode.ExtensionContext;
	private _boostExtension: BoostExtension;
	private _type: string;
    private _initialized: boolean = false;

	constructor(
		private readonly context: vscode.ExtensionContext,
		private boostExtension: BoostExtension,
		private type: string,
        private usefulContent : boolean = true
	) { 
		this._context = context;
		this._boostExtension = boostExtension;
		this._type = type;
	}

	public async resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		this._view = webviewView;

    /*
        const commands = await vscode.commands.getCommands(false);
        const myCommands = commands.filter((command) => {
            return command.startsWith(`polyverse-boost-${this._type}`);
        });
    */

		webviewView.webview.options = {
			// Allow scripts in the webview
			enableScripts: true,

			localResourceRoots: [
				this.context.extensionUri
			]
		};
    
		webviewView.webview.onDidReceiveMessage(data => {
			switch (data.command) {
				case 'initialize-visibility':
					{
                        if (!this._initialized && !this.usefulContent) {
//                            vscode.commands.executeCommand(`polyverse-boost-${this._type}-view.removeView`);
                        }
                        break;
					}
			}
		});
		this.refresh();
        this._initialized = true;
}

	public async refresh() {
		if (this._view) {
			this._view.webview.html = this._getHtmlForWebview(this._view.webview);

            this._view.show?.(true);
		}
	}

    private _getHtmlForWebview(webview: vscode.Webview) {
		const codiconsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'node_modules', '@vscode/codicons', 'dist', 'codicon.css'));
        const htmlPathOnDisk = vscode.Uri.joinPath(this.context.extensionUri, 'resources', 'dashboard', 'markdown.html');
		const jsPathOnDisk = vscode.Uri.joinPath(this.context.extensionUri, 'out', 'dashboard', 'markdown', 'main.js');
        const jsSrc = webview.asWebviewUri(jsPathOnDisk);
		const nonce = 'nonce-123456'; // TODO: add a real nonce here
        const rawHtmlContent = fs.readFileSync(htmlPathOnDisk.fsPath, 'utf8');
    
        const template = _.template(rawHtmlContent);
		const convert = marked.parse;
		const title = "Markdown";

        let boostContent = `Missing Analysis Content found for ${this._type} - please run Analyze All to generate content`;

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            boostContent = `No workspace folder found - please open a workspace folder`;
        } else {
            const summaryDataUri = getBoostFile(workspaceFolder.uri, BoostFileType.summary);
            const boostNotebook = new BoostNotebook();
            boostNotebook.load(summaryDataUri.fsPath);
            let ourCellContent = "";
            switch (this._type) {
                case "doc":
                    ourCellContent = (findCellByKernel(boostNotebook, explainOutputType) as BoostNotebookCell)?.value;
                    break;
                case "security":
                    ourCellContent = (findCellByKernel(boostNotebook, analyzeOutputType) as BoostNotebookCell)?.value;
                    break;
                case "compliance":
                    ourCellContent = (findCellByKernel(boostNotebook, complianceOutputType) as BoostNotebookCell)?.value;
                    break;
                case "blueprint":
                    ourCellContent = (findCellByKernel(boostNotebook, blueprintOutputType ) as BoostNotebookCell)?.value;
                    break;
                default:
                    ourCellContent = `Unexpected type of Analysis: ${this._type} - Unable to render markdown`;
                    break;
            }
            if (ourCellContent) {
                const summaryError = "\"Error: Boost Summary failed: ";
                if (ourCellContent.startsWith(summaryError)) {
                    boostContent =
                        "***Error Building Summary***\n\n" +
                        "Please review below error, then run Analyze and Summary to regenerate Summary data\n\n" +
                        ourCellContent.substring(summaryError.length);
                    if (boostContent.endsWith("\"")) {
                        boostContent.substring(0, boostContent.length - 1);
                    }
                    this.usefulContent = false;
                } else {
                    boostContent = ourCellContent;
                    this.usefulContent = true;
                }
            } else {
                boostContent = `***Summary Not Generated***\n\nPlease run Analyze and Summary to regenerate Summary data`;
                this.usefulContent = false;
            }
        }
        const content = boostContent;
        const htmlContent = template({ jsSrc, nonce, convert, codiconsUri, content, title});
    
        return htmlContent;
    }
}
