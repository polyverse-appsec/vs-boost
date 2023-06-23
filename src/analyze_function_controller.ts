import {
    KernelControllerBase, onServiceErrorHandler
 } from './base_controller';
import { DiagnosticCollection, ExtensionContext } from 'vscode';
import { BoostConfiguration } from './boostConfiguration';
import * as vscode from 'vscode';
import * as boostnb from './jupyter_notebook';
import { fullPathFromSourceFile } from './extension';

export const analyzeFunctionKernelName = 'analyze_function';
export const analyzeOutputType = 'bugAnalysisList';

//set a helper variable of the base url.  this should eventually be a config setting
export class BoostAnalyzeFunctionKernel extends KernelControllerBase {

    private _securityIssueCollection: DiagnosticCollection;

	constructor(context: ExtensionContext, onServiceErrorHandler: onServiceErrorHandler, otherThis: any, collection: DiagnosticCollection) {
        super(
            collection,
            analyzeFunctionKernelName,
            'Quick source scan for security vulnerabilities',
            'Quickly analyzes all targeted source code for security vulnerabiities, bugs and potential design flaws',
            analyzeOutputType,
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
                return 'need_prod_url';
        }
    }

	dispose(): void {
		super.dispose();
	}

    onKernelOutputItem(response: any): string {
        if (response.details === undefined) {
            throw new Error("Unexpected missing data from Boost Service");
        }

        let markdown = `\n\n---\n\n### Boost Source-Level Bug Analysis\n\nLast Updated: ${this.currentDateTime}\n\n`;

        if (response.details.length === 0) {
            markdown += '**No bugs found**\n\n';
            return markdown;
        }

        response.details.forEach((bug: any, index: number) => {
            markdown += `${index + 1}. **Severity**: ${bug.severity}/10\n\n`;
            markdown += `   **Line Number**: ${bug.lineNumber}\n\n`;
            markdown += `   **Bug Type**: ${bug.bugType}\n\n`;
            markdown += `   **Description**: ${bug.description}\n\n`;
            markdown += `   **Solution**: ${bug.solution}\n\n\n`;
        });

        return markdown;
    }

    localizeError(error: Error): Error {
        error.message = "Boost Code Analysis failed: " + error.message;
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
        let diagnostics: vscode.Diagnostic[] = [];
        response.details.forEach((bug: any, index: number) => {
            let range = new vscode.Range(bug.lineNumber - 1, 0, bug.lineNumber - 1, 0);
            let diagnostic = new vscode.Diagnostic(range, bug.description, vscode.DiagnosticSeverity.Warning);
            diagnostics.push(diagnostic);
        });
        this._securityIssueCollection.set(vscode.Uri.parse(sourceFile), diagnostics);

        return response.details;

    }
}
