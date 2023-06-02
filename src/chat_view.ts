import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as _ from 'lodash';
import { BoostExtension } from './extension';
import { BoostConfiguration } from './boostConfiguration';
import axios from 'axios';
import { callServiceEndpoint } from './lambda_util';
import {marked} from 'marked';
import {markedHighlight} from 'marked-highlight';
import hljs from 'highlight.js';

/*
DO NOT USE THIS.  it's a global variable and will setup a second instance of the highlighter
the original one is setup in convert_html.ts

marked.use(markedHighlight({
    langPrefix: 'hljs language-',
    highlight(code: string, lang: string) {
      if( lang === "mermaid") {
        return `<pre class="mermaid">${code}</pre>`;
      }
      const language = hljs.getLanguage(lang) ? lang : 'plaintext';
      const result = hljs.highlight(code, { language }).value;
	  console.log("original input is: " + code);
	  //console.log("highlighted output is: " + result);
	  return result;
    }
	}));		
*/
export class BoostChatViewProvider implements vscode.WebviewViewProvider {

	public static readonly viewType = 'polyverse-boost-chat-view';

	private _view?: vscode.WebviewView;
	private _response?: string;

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
			switch (data.command) {
				case 'newprompt':
					{
						this.updatePrompt(data.prompt);
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

        const htmlPathOnDisk = vscode.Uri.joinPath(this.context.extensionUri, 'resources', 'dashboard', 'chat.html');
		const jsPathOnDisk = vscode.Uri.joinPath(this.context.extensionUri, 'out', 'dashboard', 'chat', 'main.js');
        const jsSrc = webview.asWebviewUri(jsPathOnDisk);
		const nonce = 'nonce-123456'; // TODO: add a real nonce here
        const rawHtmlContent = fs.readFileSync(htmlPathOnDisk.fsPath, 'utf8');
		const history = this._response;
    
        const template = _.template(rawHtmlContent);
        const htmlContent = template({ jsSrc, nonce, boostdata, history });
    
        return htmlContent;
    }

	public get serviceEndpoint(): string {
        switch (BoostConfiguration.cloudServiceStage)
        {
            case "local":
                return 'http://127.0.0.1:8000/customprocess';
            case 'dev':
                return 'https://fudpixnolc7qohinghnum2nlm40wmozy.lambda-url.us-west-2.on.aws/';
            case "test":
                return 'https://t3ficeuoeknvyxfqz6stoojmfu0dfzzo.lambda-url.us-west-2.on.aws/';
            case 'staging':
            case 'prod':
            default:
                return 'https://7ntcvdqj4r23uklomzmeiwq7nq0dhblq.lambda-url.us-west-2.on.aws/';
        }
        
    }

	public async updatePrompt(prompt: string) {
		//make a call to the service endpoint with the prompt plus existing context
		//update the chat view with the response

        let payload = {
			"code": "",
			"prompt": prompt,
			"messages": JSON.stringify([
				{
					"role": "user",
					"content": prompt
				}
			]),
        };

		const response = await callServiceEndpoint(this.context, this.serviceEndpoint, "custom_process", payload);

		this._response = marked.parse(response.analysis);
		this.refresh();
	}
}
