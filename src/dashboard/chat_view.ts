import * as vscode from "vscode";
import * as _ from "lodash";
import * as fs from "fs";
import * as path from "path";

import { Button } from "@vscode/webview-ui-toolkit";

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
import { BoostProjectData } from "../data/BoostProjectData";

import { ChatData, aiName, ChatMessageRole } from "../data/ChatData";

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

    private chatService: BoostServiceHelper;
    private chatData: ChatData;

    constructor(context: vscode.ExtensionContext,
        boostExtension: any
    ) {
        super(context, boostExtension, "Chat");
        this.chatService = new BoostServiceHelper(
            "chatService",
            ControllerOutputType.chat,
            boostExtension
        );
        this.chatData = new ChatData(); // Initialize the ChatData
    }

    public get data(): ChatData {
        return this.chatData;
    }

    async _resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        super._resolveWebviewView(webviewView, context, _token);

        this.chatData.load();

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview, this._boostExtension.getBoostProjectData()!);

        webviewView.webview.onDidReceiveMessage(async (data) => {
            let refresh = true;
            try {
                switch (data.command) {
                    case "new-prompt": {
                        // if new chatIndex specified, choose it, otherwise use existing active
                        if (data.chatindex) {
                            this.chatData.activeid = data.chatindex;
                        }
                        await this._updatePrompt(
                            data.prompt,
                            data.showUI,
                            data.externalResponse,
                            data.originalIndex);
                        break;
                    }
                    case "add-chat": {
                        this.chatData.addChat();
                        break;
                    }
                    case "close-chat": {
                        this.chatData.closeChat(data.chatindex);
                        break;
                    }
                    case "toggle-chat-status": {
                        const previousMessage = this.chatData.getChat(data.messageIndex - 1);
                        const message = this.chatData.getChat(data.messageIndex);
                        if (message?.role === ChatMessageRole.user) {
                            // make sure we don't use this old response when reprocessing
                            this.chatData.ignoreChat(data.messageIndex + 1);
                            this.postMessage({
                                command: "chat-send-button-click",
                                externalPromptData: message.content,
                                newPrompt: true,
                                originalIndex: data.messageIndex,
                            });
                        } else if (message?.role === ChatMessageRole.error) {
                            this.postMessage({
                                command: "chat-send-button-click",
                                externalPromptData: previousMessage.content,
                                newPrompt: true,
                                originalIndex: data.messageIndex - 1,
                            });
                        } else {
                            this.chatData.toggleChatStatus(data.messageIndex);
                        }
                        break;
                    }
                    default: {
                        refresh = false;
                        break;
                    }
                }
            } finally {
                if (refresh) {
                    this.refresh();
                }
            }
        });
    }

    protected onFinishedActivationHtmlForWebview(webview: vscode.Webview, boostprojectdata: BoostProjectData): string {
        return "";
    }

    protected _getHtmlForWebview( webview: vscode.Webview, boostprojectdata: BoostProjectData) {
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
        const nonce = this.getNonce();
        const rawHtmlContent = fs.readFileSync(htmlPathOnDisk.fsPath, "utf8");

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
        
        const activeid = this.chatData.activeid;
        const chats = this.chatData.chats;

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
        externalResponse?: string,
        originalIndex?: number
    ) {
        try {
            if (externalResponse) {
                this.chatData.addResponse(prompt, externalResponse, ChatMessageRole.assistant);
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
            await chatKernel.executeAllWithAuthorization(chatNotebook.cells, chatNotebook, true).
                then((success) => {
                    if (!success) {
                        throw new Error("unknown server error");
                    } else {
                        const chatOutput = cleanCellOutput(tempProcessingCell.outputs[0]?.items[0]?.data);
                        this.chatData.addResponse(prompt, chatOutput, ChatMessageRole.assistant, originalIndex);
                    }
                    return success;
                });
        } catch (error) {
            const message = errorToString(error);
            boostLogging.error(
                `Chat requested could not complete due to ${message}`,
                showUI
            );
            this.chatData.addResponse(prompt, message, ChatMessageRole.error, originalIndex);
        }
    }
}