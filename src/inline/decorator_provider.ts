import * as vscode from "vscode";

export class DecoratorProvider {
    private smallNumberDecorationType: vscode.TextEditorDecorationType;
    private timeout: NodeJS.Timer | undefined = undefined;
    private activeEditor: vscode.TextEditor | undefined;

    constructor(context: vscode.ExtensionContext) {
        this.smallNumberDecorationType =
            vscode.window.createTextEditorDecorationType({
                borderWidth: "1px",
                borderStyle: "solid",
                overviewRulerColor: "blue",
                overviewRulerLane: vscode.OverviewRulerLane.Right,
                light: {
                    borderColor: "darkblue",
                },
                dark: {
                    borderColor: "lightblue",
                },
            });

        this.activeEditor = vscode.window.activeTextEditor;

        this.updateDecorations();

        vscode.window.onDidChangeActiveTextEditor(
            (editor) => {
                this.activeEditor = editor;
                if (editor) {
                    this.triggerUpdateDecorations();
                }
            },
            null,
            context.subscriptions
        );

        vscode.workspace.onDidChangeTextDocument(
            (event) => {
                if (
                    this.activeEditor &&
                    event.document === this.activeEditor.document
                ) {
                    this.triggerUpdateDecorations(true);
                }
            },
            null,
            context.subscriptions
        );

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
        if (!this.activeEditor) {
            return;
        }

        const text = this.activeEditor.document.getText();
        const decorations: vscode.DecorationOptions[] = [];

        for (const selection of this.activeEditor.selections) {
            const startLine = selection.start.line;
            const endLine = selection.end.line;

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
                    hoverMessage: md,
                    renderOptions: {
                        after: {
                            contentText: "hello from Boost",
                        },
                    },
                };

                decorations.push(decoration);
            }
        }

        this.activeEditor.setDecorations(
            this.smallNumberDecorationType,
            decorations
        );
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
