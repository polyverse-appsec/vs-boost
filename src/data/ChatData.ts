import * as fs from "fs";
import * as path from "path";

import * as vscode from "vscode";
import { BoostFileType, getBoostFile } from "../extension/extension";

export enum ChatMessageRole {
    user = "user",
    assistant = "assistant",
    system = "system",
    error = "error",
}

export interface Message {
    role: ChatMessageRole;
    content: string;
}

export interface Chat {
    title: string;
    messages: Message[];
}

export const aiName = "Sara";

export class ChatData {
    public chats: Chat[] = [];
    public activeid: number = 0;
    private chatFilename?: string;
    private readonly chatTitle = `${aiName} AI Chat`;
    private readonly srcChatFoldername = "chat";

    constructor(initialPath?: string) {
        if (!initialPath) {
            this.chatFilename = getBoostFile(undefined, { format: BoostFileType.chat }).fsPath;
        } else {
            this.chatFilename = initialPath;
        }

        if (fs.existsSync(this.chatFilename)) {
            this.load(this.chatFilename);
        }

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
            throw new Error("Filename for the chat is not defined. Can't save data.");
        }
        this.save(this.chatFilename);
    }
}
