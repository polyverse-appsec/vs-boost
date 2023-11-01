import * as fs from "fs";
import * as vscode from "vscode";
import { BoostFileType, getBoostFile } from "../extension/extension";
import { IAnalysisContextData } from "./IAnalysisContextData";
import { boostLogging } from "../utilities/boostLogging";

export enum ChatMessageRole {
    user = "user",
    assistant = "assistant",
    system = "system",
    error = "error",
    ignore = "ignore",
}

export interface ChatMessage {
    role: ChatMessageRole;
    content: string;
    context?: IAnalysisContextData[];
}

export interface Chat {
    title: string;
    messages: ChatMessage[];
}

export interface PromptResponse {
    prompt: ChatMessage;
    response: ChatMessage;
}

export const aiName = "Sara";

export class ChatData {
    public chats: Chat[] = [];
    public activeid: number = 0;
    private chatFilename?: string;
    private readonly chatTitle = `${aiName} AI Chat`;
    private readonly srcChatFoldername = "chat";

    constructor(initialPath?: string) {
        if (!initialPath && vscode.workspace.workspaceFolders) {
            initialPath = getBoostFile(undefined, { format: BoostFileType.chat }).fsPath;
        }

        if (initialPath && fs.existsSync(initialPath)) {
            this.load(initialPath);
        } else {
            this.chatFilename = initialPath;
        }

        this.initialize();
    }

    initialize() {
        if (this.chats.length === 0) {
            this.addChat(); // ensure we always have at least one chat
        } else {
            // we need to delete the original system prompts, since these should never be persisted
            //   they duplicate the state in the blueprint file and provide no benefit persisted separately
            this.chats.forEach((chat: Chat) => {
                for (let i = chat.messages.length - 1; i >= 0; i--) {
                    if (chat.messages[i].role === ChatMessageRole.system) {
                        chat.messages.splice(i, 1);
                    }
                }
            });
        }        
    }

    create(jsonString: string): void {
        const chatData = JSON.parse(jsonString) as Chat[];
        Object.assign(this.chats, chatData);
    }

    load(filePath: string = this.chatFilename!): void {
        const jsonString = fs.readFileSync(filePath!, "utf8");
        this.create(jsonString);
        this.chatFilename = filePath;
    }

    save(filename: string): void {
        fs.writeFileSync(filename, JSON.stringify(this.chats, null, 2), { encoding: "utf8" });
    }

    flushToFS(): void {
        if (!this.chatFilename) {
            boostLogging.warn("Filename for the Project Chat is not defined. Can't save data.");
            return;
        }
        this.save(this.chatFilename);
    }

    addResponse(
        prompt: string,
        response: string,
        responseType : ChatMessageRole = ChatMessageRole.assistant): void {
        this.chats[this.activeid].messages.push({
            role: ChatMessageRole.user,
            content: prompt,
        });

        if (response) {
            this.chats[this.activeid].messages.push({
                role: responseType,
                content: response,
            });
        }

        this.flushToFS();
    }

    addChat(): void {
        this.chats.push({
            title: this.chatTitle,
            messages: [],
        });
        this.flushToFS();
        this.activeid = this.chats.length - 1;
    }

    closeChat(chatindex: number): void {
        this.chats.splice(chatindex, 1);
        this.flushToFS();
    }

    toggleChatStatus(messageIndex: number): void {
        const message = this.chats[this.activeid].messages[messageIndex];
        if (message.role === ChatMessageRole.assistant) {
            message.role = ChatMessageRole.ignore;
        } else if (message.role === ChatMessageRole.ignore) {
            message.role = ChatMessageRole.assistant;
        }
        this.flushToFS();
    }

    getFavorites(maxFavorites: number =  5): PromptResponse[] {
        const favorites: PromptResponse[] = [];

        for (let index = this.chats[this.activeid].messages.length - 1; index >= 0; index--) {
            if (favorites.length >= maxFavorites) {
                break;
            }

            const message = this.chats[this.activeid].messages[index];
            if (message.role !== ChatMessageRole.assistant) {
                continue;
            }

            if (index === 0) {
                // if we need to read the previous message, but there isn't one, we'll skip this one
                continue;
            }
            const promptMessage = this.chats[this.activeid].messages[index - 1];
            // if previous message isn't the prompt, then skip this one
            if (promptMessage.role !== ChatMessageRole.user) {
                continue;
            }

            // favorites are assistant-tagged
            favorites.push({
                prompt: promptMessage,
                response: message,
            });
        }

        // reverse the messages - so earlier messages are first
        favorites.reverse();

        return favorites;
    }
}