import * as vscode from 'vscode';
import { CodelensProvider } from './codelens_provider';

export class InlineBoostAnnotations {
    private codeLensProvider: CodelensProvider;
    private smallNumberDecorationType: vscode.TextEditorDecorationType;
    private largeNumberDecorationType: vscode.TextEditorDecorationType;
    private timeout: NodeJS.Timer | undefined = undefined;
    private activeEditor: vscode.TextEditor | undefined;

    constructor(context: vscode.ExtensionContext) {
        this.codeLensProvider = new CodelensProvider();
        vscode.languages.registerCodeLensProvider("*", this.codeLensProvider);
        vscode.commands.registerCommand("polyverse-boost-notebook.codelensAction", (args: any) => {
            vscode.window.showInformationMessage(`CodeLens action clicked with args=${args}`);
        });

        this.smallNumberDecorationType = vscode.window.createTextEditorDecorationType({
            borderWidth: '1px',
            borderStyle: 'solid',
            overviewRulerColor: 'blue',
            overviewRulerLane: vscode.OverviewRulerLane.Right,
            light: {
                borderColor: 'darkblue'
            },
            dark: {
                borderColor: 'lightblue'
            }
        });

        this.largeNumberDecorationType = vscode.window.createTextEditorDecorationType({
            cursor: 'crosshair',
            backgroundColor: { id: 'myextension.largeNumberBackground' }
        });

        this.activeEditor = vscode.window.activeTextEditor;

        this.updateDecorations();

        vscode.window.onDidChangeActiveTextEditor(editor => {
            this.activeEditor = editor;
            if (editor) {
                this.triggerUpdateDecorations();
            }
        }, null, context.subscriptions);

        vscode.workspace.onDidChangeTextDocument(event => {
            if (this.activeEditor && event.document === this.activeEditor.document) {
                this.triggerUpdateDecorations(true);
            }
        }, null, context.subscriptions);
    }

    private updateDecorations() {
        if (!this.activeEditor) {
            return;
        }
        const regEx = /\d+/g;
        const text = this.activeEditor.document.getText();
        const smallNumbers: vscode.DecorationOptions[] = [];
        const largeNumbers: vscode.DecorationOptions[] = [];

        let match;
        while ((match = regEx.exec(text))) {
            const startPos = this.activeEditor.document.positionAt(match.index);
            const endPos = this.activeEditor.document.positionAt(match.index + match[0].length);
            const decoration = {
                range: new vscode.Range(startPos, endPos),
                hoverMessage: 'Number **' + match[0] + '**',
                renderOptions: {
                    after: {
                        contentText: "hello from Boost",
                    }
                }
            };
            if (match[0].length < 3) {
                smallNumbers.push(decoration);
            } else {
                largeNumbers.push(decoration);
            }
        }
        this.activeEditor.setDecorations(this.smallNumberDecorationType, smallNumbers);
        this.activeEditor.setDecorations(this.largeNumberDecorationType, largeNumbers);
    }

    private triggerUpdateDecorations(throttle = false) {
        if (this.timeout) {
            clearTimeout(this.timeout);
            this.timeout = undefined;
        }
        if (throttle) {
            this.timeout = setTimeout(() => this.updateDecorations(), 500);
        } else {
            this.updateDecorations();
        }
    }
}
