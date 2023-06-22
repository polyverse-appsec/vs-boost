import {
    KernelControllerBase, onServiceErrorHandler
 } from './base_controller';
import { DiagnosticCollection, ExtensionContext } from 'vscode';
import { BoostConfiguration } from './boostConfiguration';
import * as vscode from 'vscode';
import * as boostnb from './jupyter_notebook';


export const analyzeKernelName = 'analyze_function';
export const analyzeOutputType = 'bugAnalysisList';

//set a helper variable of the base url.  this should eventually be a config setting
export class BoostAnalyzeFunctionKernel extends KernelControllerBase {

    private _securityIssueCollection: DiagnosticCollection;

	constructor(context: ExtensionContext, onServiceErrorHandler: onServiceErrorHandler, otherThis: any, collection: DiagnosticCollection) {
        super(
            collection,
            analyzeKernelName,
            'Quick scan for security vulnerabilities',
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
                return 'need_dev_url';
            case "test":
                return 'need_test_url';
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
        //loop through the details field and create a markdown string to return 
        let markdown = "# Boost Bug Analysis\n\n";

        response.details.forEach((bug: any, index: number) => {
            markdown += `${index + 1}. **Severity**: ${bug.severity}/10\n`;
            markdown += `   **Line Number**: ${bug.lineNumber}\n`;
            markdown += `   **Bug Type**: ${bug.bugType}\n`;
            markdown += `   **Description**: ${bug.description}\n`;
            markdown += `   **Solution**: ${bug.solution}\n\n`;
        });

        //now add the bugs to the security issue collection
        let diagnostics: vscode.Diagnostic[] = [];
        response.details.forEach((bug: any, index: number) => {
            let range = new vscode.Range(bug.lineNumber - 1, 0, bug.lineNumber - 1, 0);
            let diagnostic = new vscode.Diagnostic(range, bug.description, vscode.DiagnosticSeverity.Error);
            diagnostics.push(diagnostic);
        });
        this._securityIssueCollection.set(vscode.Uri.parse(response.file), diagnostics);
        
        return markdown;
    }

    localizeError(error: Error): Error {
        error.message = "Boost Code Analysis failed: " + error.message;
        return error;
    }
}
