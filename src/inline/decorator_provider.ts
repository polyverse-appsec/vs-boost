import * as vscode from 'vscode';
import * as fs from 'fs';

import {
    getAnalysisForSourceTarget,
    generateSingleLineSummaryForAnalysisData
} from '../extension/vscodeUtilities';
import * as boostnb from '../data/jupyter_notebook';
import {
    getBoostFile,
    BoostCommands
} from '../extension/extension'; 
import {
    BoostExtension
} from '../extension/BoostExtension';
import { ControllerOutputType } from '../controllers/controllerOutputTypes';

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

        this.updateEditor(vscode.window.activeTextEditor);

        vscode.window.onDidChangeActiveTextEditor(this.updateEditor.bind(this), null, context.subscriptions);
        vscode.workspace.onDidChangeTextDocument(this.onTextDocumentChanged.bind(this), null, context.subscriptions);
        vscode.window.onDidChangeTextEditorSelection(this.onTextEditorSelectionChanged.bind(this), null, context.subscriptions);
    }

    private onTextDocumentChanged(event: vscode.TextDocumentChangeEvent): void {
        if (this.activeEditor && event.document === this.activeEditor.document) {
            this.updateShadowNotebook();
            this.triggerUpdateDecorations(true);
        }
    }

    private onTextEditorSelectionChanged(event: vscode.TextEditorSelectionChangeEvent): void {
        if (event.textEditor === this.activeEditor) {
            this.updateDecorations();
        }
    }        

    private updateEditor(editor: vscode.TextEditor | undefined): void {
        this.activeEditor = editor;

        this.updateShadowNotebook();
        this.triggerUpdateDecorations();
    }

    private updateDecorations() {
        if (!this.activeEditor || !this._activeEditorBoostNotebookShadow) {
            this.activeEditor?.setDecorations(this.boostLineSelectDecoration, []); // Clear old decorations
            return;
        }

        const decorations: vscode.DecorationOptions[] = [];

        for (const selection of this.activeEditor.selections) {
            const endLine = selection.end.line;
            const results = getAnalysisForSourceTarget(this._activeEditorBoostNotebookShadow, undefined, selection, [ ControllerOutputType.flowDiagram]);
            const lineSummary = generateSingleLineSummaryForAnalysisData(this._extension, this._activeEditorBoostNotebookShadow, selection);
    
            if( !results || results.length === 0 ) {
                continue;
            }
            const line = this.activeEditor.document.lineAt(endLine);
            const endPos = new vscode.Position(endLine, line.text.length);

            const hoverHeaderMarkdown = this.buildHoverHeaderMarkdown();
            const hoverMessages : vscode.MarkdownString[] = [
                hoverHeaderMarkdown,
                new vscode.MarkdownString(results.join('\n\n\n'))
            ];
            const decoration = {
                range: new vscode.Range(endPos, endPos),
                hoverMessage: hoverMessages,
                renderOptions: {
                    after: {
                        contentText: `   Boost Analysis: ${lineSummary}`,
                        color: 'rgba(150, 150, 150, 0.5)'  // grayed out with 50% transparency
                    }
                }
            };

            decorations.push(decoration);
        }

        this.activeEditor.setDecorations(this.boostLineSelectDecoration, decorations);
    }

    private buildHoverHeaderMarkdown() : vscode.MarkdownString {

        const polyverseLogoPath = vscode.Uri.joinPath(
            vscode.Uri.file(this._context.extensionPath),
            'resources',
            'polyverse_vs_boost_logo_decorator.jpg'); // 285x250

        const boostLogoPath = vscode.Uri.joinPath(
            vscode.Uri.file(this._context.extensionPath),
            'resources',
            'polyverse_boost_name_decorator.jpg'); // 1100x414

        const brandedImagesMarkdown =
            `![Polyverse](${polyverseLogoPath.toString()}) ` +
            `![Boost](${boostLogoPath.toString()}) ` +
            `__Analysis Results for ${vscode.workspace.asRelativePath(this.activeEditor!.document.fileName)}__`;

        const brandedImagesMDString = new vscode.MarkdownString(
            brandedImagesMarkdown
        );
        brandedImagesMDString.isTrusted = true;

        const createTrustedMarkdownCommand = (command : string, displayText: string) => {
            const markdownString = new vscode.MarkdownString(
                `[*${displayText}*](command:${boostnb.NOTEBOOK_TYPE + "." + command})`
            );
            markdownString.isTrusted = true;
            return markdownString;
        };
        
        const openSummaryNotebookCommand = createTrustedMarkdownCommand(BoostCommands.loadSummaryFile, "Open Summary");
        
        const openDetailsNotebookCommand = createTrustedMarkdownCommand(BoostCommands.loadCurrentFile, "Open Details");

        const hoverHeaderMarkdown = new vscode.MarkdownString(
            "--- \n"
        );
        hoverHeaderMarkdown.appendMarkdown(brandedImagesMDString.value);
        hoverHeaderMarkdown.appendMarkdown("\n\n");
        hoverHeaderMarkdown.appendMarkdown(openSummaryNotebookCommand.value);
        hoverHeaderMarkdown.appendMarkdown(" | ");
        hoverHeaderMarkdown.appendMarkdown(openDetailsNotebookCommand.value);
//        hoverHeaderMarkdown.appendMarkdown("\n --- \n");

        hoverHeaderMarkdown.isTrusted = true;
        return hoverHeaderMarkdown;
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
            this._activeEditorBoostNotebookShadow = undefined;
            return;
        }

        // only show inline analysis for file-backed documents
        if (!this.activeEditor.document.fileName ||
            this.activeEditor.document.uri.scheme !== "file") {
            return;
        }

        // don't show inline analysis for Boost notebooks - analysis is present in outputs anyway
        if (this.activeEditor.document.fileName.endsWith(boostnb.NOTEBOOK_EXTENSION)) {
            return;
        }

        const boostUri = getBoostFile(this.activeEditor.document.uri);
        if (!boostUri) {
            return;
        }
        if (fs.existsSync(boostUri.fsPath)) {
            //now load the notebook
            const boostNotebook = new boostnb.BoostNotebook();
            boostNotebook.load(boostUri.fsPath);
            this._activeEditorBoostNotebookShadow = boostNotebook;
        } else {
            this._activeEditorBoostNotebookShadow = undefined;
        }
    }
}
