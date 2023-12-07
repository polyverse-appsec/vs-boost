import * as vscode from 'vscode';
import * as fs from 'fs';
import * as _ from 'lodash';
import { BoostExtension } from '../extension/BoostExtension';
import {marked} from 'marked';
import { BoostFileType, findCellByKernel, getBoostFile } from '../extension//extension';
import { BoostUserAnalysisType } from '../data/userAnalysisType';
import { BoostProjectData } from '../data/BoostProjectData';
import { BoostNotebook, BoostNotebookCell } from '../data/jupyter_notebook';
import { boostLogging } from '../utilities/boostLogging';
import { ControllerOutputType } from '../controllers/controllerOutputTypes';
import { BaseWebviewViewProvider } from './BaseWebviewViewProvider';

/*
    // ability to get all VS commands - whether internal or not, filtered by prefix
    const commands = await vscode.commands.getCommands(false);
    const myCommands = commands.filter((command) => {
        return command.startsWith(`polyverse-boost-${this._type}`);
    });
*/

export class BoostMarkdownViewProvider extends BaseWebviewViewProvider {

	public static readonly viewType = 'polyverse-boost-markdown-view';

	private _type: string;
    private _initialized: boolean = false;

	constructor(
		context: vscode.ExtensionContext,
		boostExtension: BoostExtension,
		type: string,
        private usefulContent : boolean = true
	) {
        super(context, boostExtension, "Markdown");
		this._type = type;
	}

	async _resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
        super._resolveWebviewView(webviewView, context, _token);

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

    protected _getHtmlForWebview(
        webview: vscode.Webview,
        boostprojectdata: BoostProjectData
        ) {
        const message = super._getHtmlForWebview(webview, boostprojectdata);
        if (message) {
            return message;
        }

        const codiconsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'node_modules', '@vscode/codicons', 'dist', 'codicon.css'));
        const htmlPathOnDisk = vscode.Uri.joinPath(this._context.extensionUri, 'resources', 'dashboard', 'markdown.html');
		const jsPathOnDisk = vscode.Uri.joinPath(this._context.extensionUri, 'out', 'dashboard', 'markdown', 'main.js');
        const jsSrc = webview.asWebviewUri(jsPathOnDisk);
		const nonce = this.getNonce();
        const rawHtmlContent = fs.readFileSync(htmlPathOnDisk.fsPath, 'utf8');
    
        const template = _.template(rawHtmlContent);
		const convert = marked.parse;
		const title = "Markdown";

        let contentType;
        switch (this._type) {
            case "doc":
                contentType = "Documentation";
                break;
            case BoostUserAnalysisType.security:
                contentType = "Security";
                break;
            case BoostUserAnalysisType.compliance:
                contentType = "Compliance";
                break;
            case BoostUserAnalysisType.blueprint:
                contentType = "Blueprint";
                break;
            default:
                break;
        }

        let boostContent = `Missing Analysis Content found for ${contentType} - please run "Run Selected Analyses" to generate content`;

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

        const summaryDataUri = getBoostFile(workspaceFolder?.uri, { format: BoostFileType.summary });
        const boostNotebook = new BoostNotebook();
        // if we have a summary file, load it
        let ourCellContent = "";
        if (fs.existsSync(summaryDataUri.fsPath)) {
            boostNotebook.load(summaryDataUri.fsPath);
            switch (this._type) {
                case "doc":
                    ourCellContent = (findCellByKernel(boostNotebook, ControllerOutputType.explain) as BoostNotebookCell)?.value;
                    ourCellContent = `\n\n${(findCellByKernel(boostNotebook, ControllerOutputType.flowDiagram ) as BoostNotebookCell)?.value}`;
                    break;
                case BoostUserAnalysisType.security:
                    ourCellContent = (findCellByKernel(boostNotebook, ControllerOutputType.analyze) as BoostNotebookCell)?.value;
                    break;
                case BoostUserAnalysisType.compliance:
                    ourCellContent = (findCellByKernel(boostNotebook, ControllerOutputType.compliance) as BoostNotebookCell)?.value;
                    break;
                case BoostUserAnalysisType.blueprint:
                    ourCellContent = (findCellByKernel(boostNotebook, ControllerOutputType.blueprint ) as BoostNotebookCell)?.value;
                    break;
                default:
                    ourCellContent = `Unexpected type of Analysis: ${this._type} - Unable to render markdown`;
                    break;
            }
        } else {
            boostLogging.debug(`No summary file found at ${summaryDataUri.fsPath}`);
        }
        if (ourCellContent) {
            const summaryError = `"Error: ${contentType} Summary failed: `;
            if (ourCellContent.startsWith(summaryError)) {
                boostContent =
                    `***Error Building ${contentType} Summary***\n\n` +
                    `Please review below error, then run "Run Selected Analyses" to regenerate Summary data\n\n` +
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
            boostContent = `***To Generate ${contentType} Summary***\n\nPlease check the "${contentType}" analysis from the Analysis Summary panel above and press "Run Selected Analyses" button`;
            this.usefulContent = false;
        }
        const content = boostContent;
        const htmlContent = template({ jsSrc, nonce, convert, codiconsUri, content, title});
    
        return htmlContent;
    }
}
