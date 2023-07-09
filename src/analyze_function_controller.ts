import {
    KernelControllerBase
 } from './base_controller';
import { DiagnosticCollection, ExtensionContext } from 'vscode';
import { BoostConfiguration } from './boostConfiguration';
import * as vscode from 'vscode';
import * as boostnb from './jupyter_notebook';
import { fullPathFromSourceFile } from './extension';

export const analyzeFunctionKernelName = 'analyze_function';
export const analyzeFunctionOutputType = 'bugAnalysisList';

//set a helper variable of the base url.  this should eventually be a config setting
export class BoostAnalyzeFunctionKernel extends KernelControllerBase {

    private _securityIssueCollection: DiagnosticCollection;

	constructor(context: ExtensionContext, onServiceErrorHandler: any, otherThis: any, collection: DiagnosticCollection) {
        super(
            collection,
            analyzeFunctionKernelName,
            'Quick source scan for security vulnerabilities',
            'Quickly analyzes all targeted source code for security vulnerabiities, bugs and potential design flaws',
            analyzeFunctionOutputType,
            true,
            true, 
            context,
            otherThis,
            onServiceErrorHandler);
        this._securityIssueCollection = vscode.languages.createDiagnosticCollection(boostnb.NOTEBOOK_TYPE + '.security');
	}

    public get serviceEndpoint(): string {
        switch (BoostConfiguration.cloudServiceStage)
        {
            case "local":
                return 'http://127.0.0.1:8000/analyze_function';
            case 'dev':
                return 'https://fubldwjkv4nau5qcnbrqilv6ba0dmkcc.lambda-url.us-west-2.on.aws/';
            case "test":
                return 'https://axzomrjvbnlqtkoeyetikjmek40qovdu.lambda-url.us-west-2.on.aws/';
            case 'staging':
            case 'prod':
            default:
                return 'https://scqfjxbrko57bekv4lqkvu24fa0cmapi.lambda-url.us-west-2.on.aws/';
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

        let markdown = `\n\n---\n\n### Boost Source-Level Security Analysis\n\nLast Updated: ${this.currentDateTime}\n\n`;

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
        error.message = "Boost Security Analysis failed: " + error.message;
        return error;
    }
    onKernelProcessResponseDetails(response: any, cell : vscode.NotebookCell | boostnb.BoostNotebookCell, notebook: vscode.NotebookDocument | boostnb.BoostNotebook, mimetype : any) : any {
           //if the response.details field exists, then we will use that as the output as an object
        if (!response.details) {
            return {};
        }
        //now add the bugs to the security issue collection

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
            
                if (calculatedLineNumber < 0) {
                    calculatedLineNumber = 1;
                }
            
                let range = new vscode.Range(calculatedLineNumber, 0, calculatedLineNumber, 0);
                let diagnostic = new vscode.Diagnostic(range, `Severity: ${bug.severity}\n${bug.description}`, vscode.DiagnosticSeverity.Warning);
                diagnostics.push(diagnostic);
            });
        });
        this._securityIssueCollection.set(vscode.Uri.parse(sourceFile), diagnostics);

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
    return typeof lineNumberBase === 'number' ? lineNumberBase : 0;
}
