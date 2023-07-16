import {
    KernelControllerBase
 } from './base_controller';
import { DiagnosticCollection, ExtensionContext } from 'vscode';
import * as vscode from 'vscode';
import * as boostnb from './jupyter_notebook';
import { fullPathFromSourceFile, generateCellOutputWithHeader } from './extension';

export class FunctionKernelControllerBase extends KernelControllerBase {

    private _functionIssueCollection: DiagnosticCollection;

	constructor(
        collection: DiagnosticCollection,
        kernelId: string,
        kernelLabel: string,
        description: string,
        outputType: string,
        collectionType: string,
        outputHeader: string,
        context: ExtensionContext,
        otherThis: any,
        onServiceErrorHandler: any
        ) {

        super(
            collection,
            kernelId,
            kernelLabel,
            description,
            outputType,
            outputHeader,
            true,
            true, 
            context,
            otherThis,
            onServiceErrorHandler);

        this.outputHeader = outputHeader;
        this._functionIssueCollection = vscode.languages.createDiagnosticCollection(boostnb.NOTEBOOK_TYPE + collectionType);
	}

	dispose(): void {
		super.dispose();
	}

    onKernelOutputItem(
        response: any,
        cell : vscode.NotebookCell | boostnb.BoostNotebookCell,
        _ : any) : string {

        if (response.details === undefined) {
            throw new Error("Unexpected missing data from Boost Service");
        }

        if (response.details.length === 0) {
            return generateCellOutputWithHeader(`Source-Level ${this.outputHeader}`, `**No bugs found**`);
        }

        let markdown = '';
        const baseLineNumber = lineNumberBaseFromCell(cell);

        response.details.forEach((bug: any, index: number) => {
            let calculatedLineNumber = baseLineNumber + bug.lineNumber;            
            if (calculatedLineNumber < 1) {
                calculatedLineNumber = 1;
            }

            markdown += `${index + 1}. **Severity**: ${bug.severity}/10\n\n`;
            markdown += `   **Line Number**: ${calculatedLineNumber}\n\n`;
            markdown += `   **Bug Type**: ${bug.bugType}\n\n`;
            markdown += `   **Description**: ${bug.description}\n\n`;
            markdown += `   **Solution**: ${bug.solution}\n\n\n`;
        });

        return generateCellOutputWithHeader(`Source-Level ${this.outputHeader}`, markdown);
    }

    onKernelProcessResponseDetails(details: any, cell : vscode.NotebookCell | boostnb.BoostNotebookCell, notebook: vscode.NotebookDocument | boostnb.BoostNotebook, mimetype : any) : any {
           //if the details exists, then we will use that as the output as an object
        if (!details) {
            return {};
        }
        //now add the bugs to the issue collection

        let sourceFile;
        if (!notebook.metadata.sourceFile) {
            //if there is no source file, this was a new notebook created in memory. 
            sourceFile = notebook.uri.fsPath;
        } else {
            sourceFile = fullPathFromSourceFile(notebook.metadata.sourceFile);
        }
        const lineNumberBase = lineNumberBaseFromCell(cell);
        let diagnostics: vscode.Diagnostic[] = [];
        details.forEach((bug: any, index: number) => {
            details.forEach((bug: any, index: number) => {
                let calculatedLineNumber = lineNumberBase + bug.lineNumber - 1;
            
                if (calculatedLineNumber < 0) {
                    calculatedLineNumber = 1;
                }
            
                let range = new vscode.Range(calculatedLineNumber, 0, calculatedLineNumber, 0);
                let diagnostic = new vscode.Diagnostic(range, `Severity: ${bug.severity}\n${bug.description}`, vscode.DiagnosticSeverity.Warning);
                diagnostics.push(diagnostic);
            });
        });
        this._functionIssueCollection.set(vscode.Uri.parse(sourceFile), diagnostics);

        return details;

    }
}

function lineNumberBaseFromCell(cell: vscode.NotebookCell | boostnb.BoostNotebookCell): number {
    let lineNumberBase: any;

    if (cell instanceof boostnb.BoostNotebookCell) {
        lineNumberBase = cell.metadata ? cell.metadata.lineNumberBase : undefined;
    } else {
        lineNumberBase = cell.metadata ? cell.metadata.lineNumberBase : undefined;
    }

    // Check if lineNumberBase is a number, if not, return 0
    return typeof lineNumberBase === 'number' ? lineNumberBase : 0;
}
