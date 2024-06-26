import * as vscode from 'vscode';

import {
    FunctionKernelControllerBase
 } from '././function_base_controller';
import * as boostnb from '../data/jupyter_notebook';
import { generateCellOutputWithHeader } from '../extension/extensionUtilities';
import { boostLogging } from '../utilities/boostLogging';
import { fullPathFromSourceFile } from '../utilities/files';
import { lineNumberBaseFromCell } from '../extension/vscodeUtilities';
import { DisplayGroupFriendlyName } from '../data/userAnalysisType';
import { ControllerOutputType } from './controllerOutputTypes';
import { BoostConfiguration } from '../extension/boostConfiguration';

export class BugFunctionKernelControllerBase extends FunctionKernelControllerBase {

    public sourceLevelIssueCollection: vscode.DiagnosticCollection;

	constructor(
        collection: vscode.DiagnosticCollection,
        kernelId: string,
        kernelLabel: string,
        description: string,
        outputType: ControllerOutputType,
        displayGroup: DisplayGroupFriendlyName,
        collectionType: string,
        outputHeader: string,
        context: vscode.ExtensionContext,
        otherThis: any,
        onServiceResponseHandler: any
        ) {

        super(
            collection,
            kernelId,
            kernelLabel,
            description,
            outputType,
            displayGroup,
            outputHeader,
            context,
            otherThis,
            onServiceResponseHandler);

        this.outputHeader = outputHeader;
        this.sourceLevelIssueCollection = vscode.languages.createDiagnosticCollection(boostnb.NOTEBOOK_TYPE + collectionType);
	}

	dispose(): void {
		super.dispose();
	}

    onKernelOutputItem(
        response: any,
        notebook : vscode.NotebookDocument | boostnb.BoostNotebook,
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
        if (!details || Object.keys(details).length === 0) {
            return {};
        }

        const usingBoostNotebook = 'value' in cell;
    
        let sourceFile : string;
            // if there is no source file, this was a new notebook created in memory. 
        if (!notebook.metadata.sourceFile) {
            sourceFile = notebook.uri.fsPath;
        } else {
            sourceFile = fullPathFromSourceFile(notebook.metadata.sourceFile).fsPath;
        }
        const relativeFile = notebook.metadata.sourceFile?notebook.metadata.sourceFile:"unknown";
        const lineNumberBase = lineNumberBaseFromCell(cell);
        const linesOfText = (usingBoostNotebook?cell.value:cell.document.getText()).split('\n').length;

        // Retrieve existing diagnostics
        const sourceUri = vscode.Uri.file(sourceFile);
        const existingDiagnostics = this.sourceLevelIssueCollection.get(sourceUri);

        let diagnostics: vscode.Diagnostic[] = [];
        let severityFilteredIssues : number = 0;

        interface BoostBug {
            lineNumber: number;
            severity: number;
            bugType: string;
            description: string;
            solution: string;
        }

        //now add the bugs to the issue collection
        details.forEach((bug: BoostBug, _: number) => {
            if (bug.lineNumber < 1) {
                boostLogging.debug(`${this.command}:${relativeFile} - Problem reported in negative line number ` +
                                 `(base=${lineNumberBase}, bug line=${bug.lineNumber}). Setting to 1.`);
                bug.lineNumber = 1;
            } else if (bug.lineNumber > lineNumberBase + linesOfText) {
                boostLogging.debug(
                    `${this.command}:${relativeFile} - Problem reported in line number(${bug.lineNumber}) greater than cell lines ` +
                    `(base=${lineNumberBase}, count=${linesOfText}, last line=${lineNumberBase + linesOfText})`);
            }

            // don't generate problems for bugs that are below the severity filter
            if (bug.severity < BoostConfiguration.problemSeverityFilter) {
                severityFilteredIssues++;
                boostLogging.debug(`${this.displayCategory}:${relativeFile}(${bug.lineNumber}) - Problem excluded due to low severity (${bug.severity}): ${bug.description}`);
                return;
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
                `${this.displayCategory} ${severityToString[thisSeverity]}(${bug.severity}): ${bug.description}`,

                // to prevent builds from being blocked, we're going to lower all severities by one level
                loweredSeverity);

            // add the bug type to the diagnostic so we know how to categorize
            diagnostic.source = bug.bugType;

            // if available, add the recommended solution to the issue
            if (bug.solution) {
                    // we use notebook for offline notebooks, and the cell for online notebooks
                const solutionLocation =
                    usingBoostNotebook?vscode.Uri.file((notebook as boostnb.BoostNotebook).fsPath):cell.document.uri;
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

        if (severityFilteredIssues > 0) {
            boostLogging.info(`${this.displayCategory}:${relativeFile} - ${severityFilteredIssues} Problems excluded below severity filter (${BoostConfiguration.problemSeverityFilter})`);
        }

        return super.onKernelProcessResponseDetails(details, cell, notebook);
    }

}