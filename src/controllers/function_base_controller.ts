import {
    KernelControllerBase
 } from './base_controller';
import { DiagnosticCollection, ExtensionContext } from 'vscode';
import * as vscode from 'vscode';
import * as boostnb from '../data/jupyter_notebook';
import { fullPathFromSourceFile, generateCellOutputWithHeader } from '../extension/extension';
import { boostLogging } from '../utilities/boostLogging';

export class FunctionKernelControllerBase extends KernelControllerBase {

    public sourceLevelIssueCollection: DiagnosticCollection;

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
        this.sourceLevelIssueCollection = vscode.languages.createDiagnosticCollection(boostnb.NOTEBOOK_TYPE + collectionType);
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

    onKernelProcessResponseDetails(
        details: any,
        cell : vscode.NotebookCell | boostnb.BoostNotebookCell,
        notebook: vscode.NotebookDocument | boostnb.BoostNotebook) : any {

        //if the details exists, then we will use that as the output as an object
        if (!details) {
            return {};
        }
        //now add the bugs to the issue collection

        const usingBoostNotebook = 'value' in cell;
    
        let sourceFile : string;
        if (!notebook.metadata.sourceFile) {
            //if there is no source file, this was a new notebook created in memory. 
            sourceFile = notebook.uri.fsPath;
        } else {
            sourceFile = fullPathFromSourceFile(notebook.metadata.sourceFile).fsPath;
        }
        const lineNumberBase = lineNumberBaseFromCell(cell);
        const linesOfText = (usingBoostNotebook?cell.value:cell.document.getText()).split('\n').length;

        // Retrieve existing diagnostics
        const sourceUri = vscode.Uri.parse(sourceFile);
        const existingDiagnostics = this.sourceLevelIssueCollection.get(sourceUri);

        let diagnostics: vscode.Diagnostic[] = [];
        details.forEach((bug: any, _: number) => {
            if (bug.lineNumber < 1) {
                boostLogging.debug(`${this.id} - Diagnostic Problem reported in negative line number ` +
                                 `(lineNumberBase=${lineNumberBase}, bug line=${bug.lineNumber}). Setting to 1.`);
                bug.lineNumber = 1;
            } else if (bug.lineNumber > lineNumberBase + linesOfText) {
                boostLogging.debug(`${this.id} - Diagnostic Problem reported in line number greater than the number of lines in the cell ` +
                                 `(lineNumberBase=${lineNumberBase}, bug line=${bug.lineNumber}).`);
            }
        
            // for now we're hardcoding the following range:
            // Error: 9-10
            // Warning: 6-8
            // Info: 0-5
            // Hint: Unused by default
            const thisSeverity = bug.severity > 8?
                vscode.DiagnosticSeverity.Error: // should be error - but Error blocks builds for customer
                bug.severity > 5?
                    vscode.DiagnosticSeverity.Warning:
                    vscode.DiagnosticSeverity.Information;
    
            const loweredSeverity = thisSeverity === vscode.DiagnosticSeverity.Error?
                vscode.DiagnosticSeverity.Warning:
                thisSeverity === vscode.DiagnosticSeverity.Warning?
                    vscode.DiagnosticSeverity.Information:
                    vscode.DiagnosticSeverity.Hint;

            let severityToString = {
                [vscode.DiagnosticSeverity.Error]: 'Error',
                [vscode.DiagnosticSeverity.Warning]: 'Warning',
                [vscode.DiagnosticSeverity.Information]: 'Information',
                [vscode.DiagnosticSeverity.Hint]: 'Hint'
            };

            // we're going tp print the actual severity of the issue in the description
            //      even though its one-off from the severity of the diagnostic
            let range = new vscode.Range(bug.lineNumber, 0, bug.lineNumber, 0);
            let diagnostic = new vscode.Diagnostic(
                range,
                `${severityToString[thisSeverity]}: ${bug.description}`,

                // to prevent builds from being blocked, we're going to lower all severities by one level
                loweredSeverity);

            // add the bug type to the diagnostic so we know how to categorize
            diagnostic.source = bug.bugType;

            // if available, add the recommended solution to the issue
            if (bug.solution) {
                    // we use notebook for offline notebooks, and the cell for online notebooks
                const solutionLocation =
                    usingBoostNotebook?vscode.Uri.parse((notebook as boostnb.BoostNotebook).fsPath):cell.document.uri;
                    // we don't have a specific location for the solution beyond the cell or notebook, so use start of the location
                const solutionSpecificLocation = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 0));
                let relatedInformation = new vscode.DiagnosticRelatedInformation(
                    new vscode.Location(solutionLocation, solutionSpecificLocation), 
                    bug.solution);
                diagnostic.relatedInformation = [relatedInformation];
            }
            
            // Only add the diagnostic if it doesn't exist in the existingDiagnostics
            if (!existingDiagnostics || !existingDiagnostics.find(existingDiagnostic => 
                existingDiagnostic.message === diagnostic.message && existingDiagnostic.range.isEqual(diagnostic.range))) {
                diagnostics.push(diagnostic);
            } else {
                boostLogging.debug(`${this.id} - Diagnostic Problem already exists in the collection. Skipping.`);
            }
        });

        // Filter existing diagnostics that are not in the line range of the current cell
        const filteredDiagnostics = existingDiagnostics?existingDiagnostics.filter(diagnostic => {
            const lineNumber = diagnostic.range.start.line;
            return lineNumber < lineNumberBase || lineNumber >= lineNumberBase + linesOfText;
        }):[];

        // Merge filtered existing with new diagnostics
        const mergedDiagnostics = [...filteredDiagnostics, ...diagnostics];
        
        this.sourceLevelIssueCollection.set(sourceUri, mergedDiagnostics);

        return super.onKernelProcessResponseDetails(details, cell, notebook);
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
