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
	private _chats?: any;

	constructor(
		private readonly context: vscode.ExtensionContext,
		private _boostExtension: BoostExtension
	) { 
	}

	public resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		this._view = webviewView;

		this._chats = this._initializeChats();

		webviewView.webview.options = {
			// Allow scripts in the webview
			enableScripts: true,

			localResourceRoots: [
				this.context.extensionUri
			]
		};

		webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

		webviewView.webview.onDidReceiveMessage(data => {
			switch (data.command) {
				case 'newprompt':
					{
						this.updatePrompt(data.prompt, data.model);
					}
			}
		});
	}

	public refresh() {
		if (this._view) {
			this._view.webview.html = this._getHtmlForWebview(this._view.webview);
			this._view.show?.(true);
		}
	}

    private _getHtmlForWebview(webview: vscode.Webview) {

        const htmlPathOnDisk = vscode.Uri.joinPath(this.context.extensionUri, 'resources', 'dashboard', 'chat.html');
		const jsPathOnDisk = vscode.Uri.joinPath(this.context.extensionUri, 'out', 'dashboard', 'chat', 'main.js');
        const jsSrc = webview.asWebviewUri(jsPathOnDisk);
		const nonce = 'nonce-123456'; // TODO: add a real nonce here
        const rawHtmlContent = fs.readFileSync(htmlPathOnDisk.fsPath, 'utf8');
		const chats = this._chats;
    
        const template = _.template(rawHtmlContent);
		const convert = marked.parse;
        const htmlContent = template({ jsSrc, nonce, chats, convert });
    
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

	public async updatePrompt(prompt: string, model: string) {
		//make a call to the service endpoint with the prompt plus existing context
		//update the chat view with the response
		const messages = this._chats[0].messages;

        let payload = {
			"code": "",
			"model": model,
			"prompt": prompt,
			"messages": JSON.stringify([
				...messages,
				{
					"role": "user",
					"content": prompt
				}
			]),
        };

		const response = await callServiceEndpoint(this.context, this.serviceEndpoint, "custom_process", payload);

		this._addChat(prompt, response.analysis);
		this.refresh();
	}

	public _addChat(prompt: string, chat: string) {
		this._chats[0].messages.push({
			"role": "user",
			"content": prompt
		});
		this._chats[0].messages.push({
			"role": "assistant",
			"content": chat
		});
	}

	private _initializeChats(): any {
		return [
			{
				"title": "Chat 1",
				"messages": [
					{
						"role": "assistant",
						"content": "somethign smart"
					}
				]
			}
		];
	}
}
