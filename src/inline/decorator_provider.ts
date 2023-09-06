import * as vscode from 'vscode';
import {getAnalysisForSourceTarget, generateSingleLineSummaryForAnalysisData} from '../extension/vscodeUtilities';
import * as boostnb from '../data/jupyter_notebook';
import * as fs from 'fs';
import {getBoostFile} from '../extension/extension'; 
import {BoostNotebook} from '../data/jupyter_notebook'; 
import {BoostExtension} from '../extension/BoostExtension';

export class DecoratorProvider {
    private boostLineSelectDecoration: vscode.TextEditorDecorationType;
    private timeout: NodeJS.Timer | undefined = undefined;
    private activeEditor: vscode.TextEditor | undefined;
    private _activeEditorBoostNotebookShadow: boostnb.BoostNotebook | undefined;
    private _context: vscode.ExtensionContext;
    private _extension: BoostExtension;

    constructor(context: vscode.ExtensionContext, extension: BoostExtension) {
        this._context = context;
        this._extension = extension;

        this.boostLineSelectDecoration = vscode.window.createTextEditorDecorationType({
            borderWidth: '1px',
            borderStyle: 'solid',
            overviewRulerColor: 'blue',
            overviewRulerLane: vscode.OverviewRulerLane.Right,
            light: {
                borderColor: 'darkblue'
            },
            dark: {
                borderColor: 'lightblue'
            },
            opacity: '0.5'
        });

        this.activeEditor = vscode.window.activeTextEditor;

        this.updateShadowNotebook();
        this.updateDecorations();

        vscode.window.onDidChangeActiveTextEditor(editor => {
            this.activeEditor = editor;
            if (editor) {
                this.updateShadowNotebook();
                this.triggerUpdateDecorations();
            }
        }, null, context.subscriptions);

        vscode.workspace.onDidChangeTextDocument(event => {
            if (this.activeEditor && event.document === this.activeEditor.document) {
                this.updateShadowNotebook();
                this.triggerUpdateDecorations(true);
            }
        }, null, context.subscriptions);

        vscode.window.onDidChangeTextEditorSelection(
            (event) => {
                if (event.textEditor === this.activeEditor) {
                    this.updateDecorations();
                }
            },
            null,
            context.subscriptions
        );
    }

    private updateDecorations() {
        if (!this.activeEditor || !this._activeEditorBoostNotebookShadow) {
            return;
        }

        const decorations: vscode.DecorationOptions[] = [];

        for (const selection of this.activeEditor.selections) {
            const startLine = selection.start.line;
            const endLine = selection.end.line;
            const results = getAnalysisForSourceTarget(this._activeEditorBoostNotebookShadow, undefined, selection);
            const lineSummary = generateSingleLineSummaryForAnalysisData(this._extension, this._activeEditorBoostNotebookShadow, selection);
    
            if( !results || results.length === 0 ) {
                continue;
            }
            for (let lineNum = startLine; lineNum <= endLine; lineNum++) {
                const line = this.activeEditor.document.lineAt(lineNum);
                const startPos = new vscode.Position(lineNum, line.text.length);
                const endPos = new vscode.Position(lineNum, line.text.length);

                const md = new vscode.MarkdownString(
                    "[Run command](command:polyverse-boost-notebook.showGuidelines) *Hello* from Boost!"
                );
                md.isTrusted = true;
                const decoration = {
                    range: new vscode.Range(startPos, endPos),
                    hoverMessage: new vscode.MarkdownString(results.join('\n')),
                    renderOptions: {
                        after: {
                            contentText: lineSummary,
                            color: 'rgba(150, 150, 150, 0.5)'  // grayed out with 50% transparency
                        }
                    }
                };

                decorations.push(decoration);
            }
        }
    
        this.activeEditor.setDecorations(this.boostLineSelectDecoration, decorations);
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

    private updateShadowNotebook() {
        if (!this.activeEditor) {
            return;
        }

        const boostUri = getBoostFile(this.activeEditor.document.uri);
        if (!boostUri) {
            return;
        }
        //now load the notebook
        const boostNotebook = new BoostNotebook();
        if (fs.existsSync(boostUri.fsPath)) {
            boostNotebook.load(boostUri.fsPath);
            this._activeEditorBoostNotebookShadow = boostNotebook;
        } else {
            this._activeEditorBoostNotebookShadow = undefined;
        }
    }
}
