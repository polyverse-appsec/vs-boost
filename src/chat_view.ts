import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as _ from 'lodash';
import * as os from 'os';
import { BoostExtension } from './BoostExtension';
import { BoostConfiguration } from './boostConfiguration';
import { callServiceEndpoint } from './lambda_util';
import {marked} from 'marked';
import { getOrCreateBlueprintUri} from './BoostProjectData';


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
	private _chats?: any;
	private _tempFilename?: string;
	private _context: vscode.ExtensionContext;
	private _activeid = 0;
	private _boostExtension: BoostExtension;

	constructor(
		private readonly context: vscode.ExtensionContext,
		private boostExtension: BoostExtension
	) { 
		this._context = context;
		this._boostExtension = boostExtension;
	}

	public async resolveWebviewView(
		webviewView: vscode.WebviewView,
		context: vscode.WebviewViewResolveContext,
		_token: vscode.CancellationToken,
	) {
		this._view = webviewView;

		this._chats = await this._initializeChats();

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
						this._activeid = data.chatindex;
						this.updatePrompt(data.prompt, data.model);
						break;
					}
				case 'add-chat':
					{
						this._addChat();
						break;
					}
				case 'close-chat':
					{
						this._closeChat(data.chatindex);
						break;
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
		const codiconsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._context.extensionUri, 'node_modules', '@vscode/codicons', 'dist', 'codicon.css'));
        const htmlPathOnDisk = vscode.Uri.joinPath(this.context.extensionUri, 'resources', 'dashboard', 'chat.html');
		const jsPathOnDisk = vscode.Uri.joinPath(this.context.extensionUri, 'out', 'dashboard', 'chat', 'main.js');
        const jsSrc = webview.asWebviewUri(jsPathOnDisk);
		const nonce = 'nonce-123456'; // TODO: add a real nonce here
        const rawHtmlContent = fs.readFileSync(htmlPathOnDisk.fsPath, 'utf8');
		const chats = this._chats;
    
        const template = _.template(rawHtmlContent);
		const convert = marked.parse;
		const activeid = this._activeid;
        const htmlContent = template({ jsSrc, nonce, chats, convert, codiconsUri, activeid});
    
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

		this._addResponse(prompt, response.analysis);
		this._saveJsonData(this._chats);
		this.refresh();
	}

	private _addResponse(prompt: string, chat: string) {
		this._chats[this._activeid].messages.push({
			"role": "user",
			"content": prompt
		});
		this._chats[this._activeid].messages.push({
			"role": "assistant",
			"content": chat
		});
	}

	private async _initializeChats(): Promise<any> {
		this._chats = this._loadJsonData();

		if (this._chats === undefined){
			this._chats = [{
				title: "AI Chat",
				messages: [await this._getInitialSystemMessage()]
			}];
		}
		return this._chats;
	}

	private async _addChat() {
		this._chats.push({
			title: "AI Chat",
			messages: [await this._getInitialSystemMessage()]
		});
		this._saveJsonData(this._chats);
		this._activeid = this._chats.length - 1;
		this.refresh();
	}

	private _closeChat(chatindex: number) {
		this._chats.splice(chatindex, 1);
		this._saveJsonData(this._chats);
		this.refresh();
	}

	private async _getInitialSystemMessage(): Promise<any> {
		const boostdata = this._boostExtension.getBoostProjectData();
		const blueprintUri = await getOrCreateBlueprintUri(this.context, boostdata.summary.blueprintUrl);
		//now load the blueprint from the file system and get the first prompt
		const blueprintdata = fs.readFileSync(blueprintUri.fsPath, 'utf8');
		const systemPrompt = "You are an AI programming assistant working on a project described after ####. You prioritize accurate responses and all responses are in markdown format. ####\n";
		return {
			"role": "system",
			"content": systemPrompt + blueprintdata
		};
	}

	private _getTempFilename(): string {
		if( this._tempFilename ) {
			return this._tempFilename;
		}
		const editor = vscode.window.activeTextEditor;
		let filenamePrefix = 'temp_';
	  
		if (editor) {
		  const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
		  if (workspaceFolder) {
			filenamePrefix += workspaceFolder.name;
		  } else {
			filenamePrefix += 'boost_ai_chat';
		  }
		} else {
		  filenamePrefix += 'boost_ai_chat';
		}
	  
		const tempFilePath = path.join(os.tmpdir(), `${filenamePrefix}.json`);
		this._tempFilename = tempFilePath;
		return tempFilePath;
	  }
	  
	private _saveJsonData(data: any): void {
		const tempFilename = this._getTempFilename();
	  
		fs.writeFile(tempFilename, JSON.stringify(data, null, 2), (err) => {
		  if (err) {
			vscode.window.showErrorMessage(`Failed to save data: ${err.message}`);
		  }
		});
	  }
	  
	private _loadJsonData(): any | undefined {
		const tempFilename = this._getTempFilename();

		//check if file exists
		if (!fs.existsSync(tempFilename)) {
			return undefined;
		}
	  
		try {
		  const data = fs.readFileSync(tempFilename).toString();
		  return JSON.parse(data);
		} catch (err) {
		  vscode.window.showErrorMessage(`Failed to load data: ${(err as Error).message}`);
		  return undefined;
		}
	}
}
