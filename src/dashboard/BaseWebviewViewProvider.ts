import * as vscode from 'vscode';

import { boostLogging } from '../utilities/boostLogging';
import { BoostProjectData } from '../data/BoostProjectData';
import { BoostExtension } from "../extension/BoostExtension";
import {
    noProjectOpenMessage,
    extensionNotFullyActivated,
    extensionFailedToActivate
} from '../data/boostprojectdata_interface';

export abstract class BaseWebviewViewProvider implements vscode.WebviewViewProvider {

    protected _view?: vscode.WebviewView;
    protected _context: vscode.ExtensionContext;
    protected _boostExtension: BoostExtension;
    protected _title: string;

    constructor(
        private readonly context: vscode.ExtensionContext,
        private boostExtension: BoostExtension,
        title: string
    ) {
        this._context = context;
        this._boostExtension = boostExtension;
        this._title = title;
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        token: vscode.CancellationToken
    ): void {
        try {
            this._resolveWebviewView(webviewView, context, token);
        } catch (e) {
            boostLogging.error(`Could not load Boost ${this._title} View due to ${e}`, false);
        }
    }

    public get visible(): boolean {
        return this._view?.visible ?? false;
    }

    public postMessage(message: any): Thenable<boolean> {
        return this._view?.webview.postMessage(message) ?? Promise.resolve(false);
    }

    protected _resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        token: vscode.CancellationToken
    ): void {
        this._view = webviewView;

        webviewView.webview.options = {
            // Allow scripts in the webview
            enableScripts: true,

            localResourceRoots: [
                this.context.extensionUri
            ]
        };
    }

    public refresh(): void {
        try {
            this._refresh();
        } catch (e) {
            boostLogging.error(`Could not refresh Boost ${this._title} View due to ${e}`, false);
        }
    }


    async _refresh() {
        if (!this._view) {
            return;
        }
        
        this._view.webview.html = this._getHtmlForWebview(
            this._view.webview,
            this._boostExtension.getBoostProjectData()!
        );
        this._view.show?.(true);
    }

    protected _getHtmlForWebview(webview: vscode.Webview, boostprojectdata: BoostProjectData): string {

        let message;
        if (!this._boostExtension.finishedActivation) {
            if (!vscode.workspace.workspaceFolders) {
                message = noProjectOpenMessage;
            } else {
                message = extensionNotFullyActivated;
            }
        } else if (!this._boostExtension.successfullyActivated) {
            message = extensionFailedToActivate;
        } else if (!boostprojectdata || !vscode.workspace.workspaceFolders) {
            message = noProjectOpenMessage;
        }
        
        if (message) {
            return `<html><body><h3>Project ${this._title}</h3><p>${message}</p></body></html>`;
        } else {
            return "";
        }
    }
}
