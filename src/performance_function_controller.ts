import {
    KernelControllerBase, onServiceErrorHandler
 } from './base_controller';
import { DiagnosticCollection, ExtensionContext } from 'vscode';
import { BoostConfiguration } from './boostConfiguration';
import * as vscode from 'vscode';
import * as boostnb from './jupyter_notebook';
import { fullPathFromSourceFile } from './extension';
import { boostLogging } from './boostLogging';

export const performanceFunctionKernelName = 'performance_function';
export const performanceFunctionOutputType = 'performanceList';

//set a helper variable of the base url.  this should eventually be a config setting
export class BoostPerformanceFunctionKernel extends KernelControllerBase {

    private _performanceIssueCollection: DiagnosticCollection;

	constructor(context: ExtensionContext, onServiceErrorHandler: onServiceErrorHandler, otherThis: any, collection: DiagnosticCollection) {
        super(
            collection,
            performanceFunctionKernelName,
            'Quick source scan for performance issues',
            'Quickly analyzes all targeted source code for performance issues',
            performanceFunctionOutputType,
            true,
            true, 
            context,
            otherThis,
            onServiceErrorHandler);
        this._performanceIssueCollection = vscode.languages.createDiagnosticCollection(boostnb.NOTEBOOK_TYPE + '.performance');
	}

    public get serviceEndpoint(): string {
        switch (BoostConfiguration.cloudServiceStage)
        {
            case "local":
                return 'http://127.0.0.1:8000/performance_function';
            case 'dev':
                return 'https://6ucgf5nhzygxehglg5r7nd73640lykwa.lambda-url.us-west-2.on.aws/';
            case "test":
                throw new Error("Not Implemented");
            case 'staging':
            case 'prod':
            default:
                return 'https://vhdpiji3mrr5ass7o5tx5mx5oa0nrjth.lambda-url.us-west-2.on.aws/';
        }
    }

	dispose(): void {
		super.dispose();
	}


    onKernelOutputItem(
        response: any,
        cell : vscode.NotebookCell | boostnb.BoostNotebookCell,
        mimetype : any) : string {

            if (response.details === undefined) {
            throw new Error("Unexpected missing data from Boost Service");
        }

        let markdown = `\n\n---\n\n### Boost Source-Level Performance Analysis\n\nLast Updated: ${this.currentDateTime}\n\n`;

        if (response.details.length === 0) {
            markdown += '**No bugs found**\n\n';
            return markdown;
        }

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

        return markdown;
    }

    localizeError(error: Error): Error {
        error.message = "Boost Performance Analysis failed: " + error.message;
        return error;
    }

    onKernelProcessResponseDetails(response: any, cell : vscode.NotebookCell | boostnb.BoostNotebookCell, notebook: vscode.NotebookDocument | boostnb.BoostNotebook, mimetype : any) : any {
           //if the response.details field exists, then we will use that as the output as an object
        if (!response.details) {
            return {};
        }
        //now add the bugs to the performance issue collection

        let sourceFile;
        if (!notebook.metadata.sourceFile) {
            //if there is no source file, this was a new notebook created in memory. 
            sourceFile = notebook.uri.fsPath;
        } else {
            sourceFile = fullPathFromSourceFile(notebook.metadata.sourceFile);
        }
        const lineNumberBase = lineNumberBaseFromCell(cell);
        let diagnostics: vscode.Diagnostic[] = [];
        response.details.forEach((bug: any, index: number) => {
            response.details.forEach((bug: any, index: number) => {
                let calculatedLineNumber = lineNumberBase + bug.lineNumber - 1;
            
                if (calculatedLineNumber < 1) {
                    calculatedLineNumber = 1;
                }
            
                let range = new vscode.Range(calculatedLineNumber, 0, calculatedLineNumber, 0);
                let diagnostic = new vscode.Diagnostic(range, `Severity: ${bug.severity}\n${bug.description}`, vscode.DiagnosticSeverity.Warning);
                diagnostics.push(diagnostic);
            });
        });
        this._performanceIssueCollection.set(vscode.Uri.parse(sourceFile), diagnostics);

        return response.details;

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
    if (typeof lineNumberBase === 'number') {
        return lineNumberBase;
    }
    else {
        return 0;
    }
}
