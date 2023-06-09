import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as _ from 'lodash';
import * as os from 'os';
import { BoostExtension } from './BoostExtension';
import { BoostConfiguration } from './boostConfiguration';
import { callServiceEndpoint } from './lambda_util';
import {marked} from 'marked';
import { getOrCreateBlueprintUri} from './extension';



export class BoostMarkdownViewProvider implements vscode.WebviewViewProvider {

	public static readonly viewType = 'polyverse-boost-chat-view';

	private _view?: vscode.WebviewView;
	private _context: vscode.ExtensionContext;
	private _boostExtension: BoostExtension;
	private _type: string;

	constructor(
		private readonly context: vscode.ExtensionContext,
		private boostExtension: BoostExtension,
		private type: string
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


		webviewView.webview.options = {
			// Allow scripts in the webview
			enableScripts: true,

			localResourceRoots: [
				this.context.extensionUri
			]
		};

		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

	}

	public refresh() {
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
		const content = "# hello world\n* item 1\n* item 2\n* item 3\n";
		const title = "Markdown";

        const htmlContent = template({ jsSrc, nonce, convert, codiconsUri, content, title});
    
        return htmlContent;
    }
}
