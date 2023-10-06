import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as _ from "lodash";
import * as os from "os";

import {
    Button
} from "@vscode/webview-ui-toolkit";

import { BoostExtension } from "../extension/BoostExtension";
import { marked } from "marked";
import { cleanCellOutput } from "../extension/extensionUtilities";
import { BoostServiceHelper } from "../controllers/boostServiceHelper";
import { boostLogging } from "../utilities/boostLogging";
import {
    BoostNotebook,
    BoostNotebookCell,
    NotebookCellKind
} from "../data/jupyter_notebook";
import { ControllerOutputType } from "../controllers/controllerOutputTypes";
import { chatKernelName } from "../controllers/chat_controller";
import sanitizeHtml from "sanitize-html";
import { ICellMetadata } from "@jupyterlab/nbformat";
import { errorToString } from "../utilities/error";
import { BaseWebviewViewProvider } from "./BaseWebviewViewProvider";

export const aiName = "Sara";

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
export class BoostChatViewProvider extends BaseWebviewViewProvider {
    public static readonly viewType = "polyverse-boost-chat-view";

    private _chats?: any;
    private _tempFilename?: string;
    private _activeid = 0;
    private chatService: BoostServiceHelper;

    constructor(context: vscode.ExtensionContext,
            boostExtension: any
    ) {
        super(context, boostExtension, "Chat");
        this.chatService = new BoostServiceHelper(
            "chatService",
            ControllerOutputType.chat,
            boostExtension
        );
    }

    async _resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        super._resolveWebviewView(webviewView, context, _token);

        this._chats = await this._initializeChats();

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview, this._boostExtension.getBoostProjectData());

        webviewView.webview.onDidReceiveMessage((data) => {
            switch (data.command) {
                case "new-prompt": {
                    // if new chatIndex specified, choose it, otherwise use existing active
                    if (data.chatindex) {
                        this._activeid = data.chatindex;
                    }
                    this._updatePrompt(data.prompt, data.showUI, data.externalResponse);
                    break;
                }
                case "add-chat": {
                    this._addChat();
                    break;
                }
                case "close-chat": {
                    this._closeChat(data.chatindex);
                    break;
                }
            }
        });
    }

    protected _getHtmlForWebview(webview: vscode.Webview, boostprojectdata: any): string {

        const message = super._getHtmlForWebview(webview, boostprojectdata);
        if (message) {
            return message;
        }


        const codiconsUri = webview.asWebviewUri(
            vscode.Uri.joinPath(
                this._context.extensionUri,
                "node_modules",
                "@vscode/codicons",
                "dist",
                "codicon.css"
            )
        );
        const htmlPathOnDisk = vscode.Uri.joinPath(
            this._context.extensionUri,
            "resources",
            "dashboard",
            "chat.html"
        );
        const jsPathOnDisk = vscode.Uri.joinPath(
            this._context.extensionUri,
            "out",
            "dashboard",
            "chat",
            "main.js"
        );
        const jsSrc = webview.asWebviewUri(jsPathOnDisk);
        const nonce = "nonce-123456"; // TODO: add a real nonce here
        const rawHtmlContent = fs.readFileSync(htmlPathOnDisk.fsPath, "utf8");
        const chats = this._chats;

        const workspaceFolder = vscode.workspace.workspaceFolders
            ? vscode.workspace.workspaceFolders[0]
            : ""; // Get the first workspace folder

        const projectName = workspaceFolder
            ? path.basename(workspaceFolder.uri.fsPath)
            : "your workspace";

        const template = _.template(rawHtmlContent);
        const convert = (text: string) => {
            const escapedText = _.escape(text);
            const rawHtml = marked.parse(escapedText);
            const cleanHTML = sanitizeHtml(rawHtml);
            return cleanHTML;
        };
        const activeid = this._activeid;
        const htmlContent = template({
            jsSrc,
            nonce,
            chats,
            convert,
            codiconsUri,
            activeid,
            projectName,
            aiName,
        });

        return htmlContent;
    }

    async _updatePrompt(
        prompt: string,
        showUI: boolean,
        externalResponse?: string
    ) {
        // make a call to the service endpoint with the prompt plus existing context
        // update the chat view with the response

        // we don't save the initial prompts - so we can refresh them each time we send... we only save chat history (persisted)
        try {
            if (externalResponse) {
                // save chat response and run cleanup
                this._addResponse(prompt, externalResponse);
                return;
            }

            const chatNotebook = new BoostNotebook();
            const tempProcessingCell = new BoostNotebookCell(
                NotebookCellKind.Markup,
                prompt,
                "markdown",
                undefined,
                { // eslint-disable-next-line @typescript-eslint/naming-convention
                    "analysis_type": ControllerOutputType.chat,
                } as unknown as ICellMetadata
            );
            chatNotebook.addCell(tempProcessingCell);

            const chatKernel = (this._boostExtension as BoostExtension).kernels.get(chatKernelName)!;
            const success = await chatKernel.executeAllWithAuthorization(chatNotebook.cells, chatNotebook, true);
            const chatOutput = success?cleanCellOutput(tempProcessingCell.outputs[0]?.items[0]?.data):"";

            this._addResponse(prompt, chatOutput);
        } catch (error) {
            boostLogging.error(
                `Chat requested could not complete due to ${errorToString(error)}`,
                showUI
            );
            this._addResponse(prompt, "");
        } finally {
            this._saveJsonData(this._chats);
            this.refresh();
        }
    }

    private _addResponse(prompt: string, response: string) {
        this._chats[this._activeid].messages.push({
            role: "user",
            content: prompt,
        });

        if (!response) {
            return;
        }
        this._chats[this._activeid].messages.push({
            role: "assistant",
            content: response,
        });
    }

    readonly _chatTitle = `${aiName} AI Chat`;

    private async _initializeChats(): Promise<any> {
        this._chats = this._loadJsonData();

        if (this._chats === undefined) {
            this._chats = [
                {
                    title: this._chatTitle,
                    messages: [],
                },
            ];
        } else {
            // we need to delete the original system prompts, since these should never be persisted
            //   they duplicate the state in the blueprint file and provide no benefit persisted separately
            this._chats.forEach((chat: any) => {
                for (let i = chat.messages.length - 1; i >= 0; i--) {
                    if (chat.messages[i].role === "system") {
                        chat.messages.splice(i, 1);
                    }
                }
            });
        }
        return this._chats;
    }

    private async _addChat() {
        this._chats.push({
            title: this._chatTitle,
            messages: [],
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

    private _getTempFilename(): string {
        if (this._tempFilename) {
            return this._tempFilename;
        }
        const editor = vscode.window.activeTextEditor;
        let filenamePrefix = "temp_";

        if (editor) {
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(
                editor.document.uri
            );
            if (workspaceFolder) {
                filenamePrefix += workspaceFolder.name;
            } else {
                filenamePrefix += "boost_ai_chat";
            }
        } else {
            filenamePrefix += "boost_ai_chat";
        }

        const tempFilePath = path.join(os.tmpdir(), `${filenamePrefix}.json`);
        const normalizedTempPath = path.normalize(tempFilePath);
        this._tempFilename = normalizedTempPath;
        return normalizedTempPath;
    }

    private _saveJsonData(data: any): void {
        const tempFilename = this._getTempFilename();

        fs.writeFile(tempFilename, JSON.stringify(data, null, 2), (err) => {
            if (err) {
                vscode.window.showErrorMessage(
                    `Failed to save data: ${err.message}`
                );
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
            const data = fs.readFileSync(tempFilename, "utf-8");
            return JSON.parse(data);
        } catch (err) {
            boostLogging.error(
                `Boost failed to load Chat history: ${errorToString(err)}`,
                true
            );
            return undefined;
        }
    }
}
