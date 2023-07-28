import * as path from 'path';

import {
    KernelControllerBase,
    markdownMimeType
} from './base_controller';

import { BoostConfiguration } from './boostConfiguration';

import { buildVSCodeIgnorePattern } from './extension';

import {
    FunctionKernelControllerBase,
} from './function_base_controller';

import * as vscode from 'vscode';
import {
    BoostNotebookCell,
    BoostNotebook,
    NotebookCellKind,
    SerializedNotebookCellOutput } from './jupyter_notebook';
import { boostLogging } from './boostLogging';
import { findCellByKernel, generateCellOutputWithHeader } from './extension';
import { getCurrentOrganization } from "./authorization";
import { ControllerOutputType } from './controllerOutputTypes';

export const quickSummaryKernelNamePrefix = `quick_summary_`;

export class BoostQuickSummaryKernelControllerBase extends KernelControllerBase {
	constructor(context: vscode.ExtensionContext, onServiceErrorHandler: any, otherThis : any, collection: vscode.DiagnosticCollection,
            kernelName: string,
            outputType: ControllerOutputType,
            coreOutputType: ControllerOutputType,
            outputHeader: string,
        ) {
        super(
            collection,
            `${quickSummaryKernelNamePrefix}${kernelName}`,
            `Quick ${outputHeader} Report`,
            `Quickly builds a ${outputHeader} Summary Report from data about project and ${outputType} analysis.`,
            outputType,
            `Architectural Quick Summary ${outputHeader} Report`,
            false,
            false,
            context,
            otherThis,
            onServiceErrorHandler);
        this._coreOutputType = coreOutputType;

        // tap the parent controller to get it initialized for any potential config or init errors
        // NOTE: This assumes the parent has already been initialized
        this.parentController;
	}

    private _coreOutputType: ControllerOutputType;

	dispose(): void {
		super.dispose();
	}

    public get serviceEndpoint(): string {
        switch (BoostConfiguration.cloudServiceStage)
        {
            case "local":
                return 'http://127.0.0.1:8000/quick-summary';
            case 'dev':
                return 'https://vyuhthnoinejl6hle7cq7frzta0uzjzp.lambda-url.us-west-2.on.aws/';
            case "test":
                return 'https://vaue3wqhqsj3bfzq55djwtmxry0vlnyu.lambda-url.us-west-2.on.aws/';
            case 'staging':
            case 'prod':
            default:
                return 'https://ur4c2bfxchy626dzumtengt4ta0bpser.lambda-url.us-west-2.on.aws/';
        }
    }

    async executeAll(
        _: (vscode.NotebookCell | BoostNotebookCell)[],
        notebook: vscode.NotebookDocument | BoostNotebook,
        session: vscode.AuthenticationSession,
        forceAnalysisRefresh: boolean = false
    ): Promise<void>  {
        const usingBoostNotebook = notebook instanceof BoostNotebook;

        // for now, we ignore forceAnalysisRefresh - and always re-analyze
        forceAnalysisRefresh = true;

        if (!usingBoostNotebook) {
            throw new Error("Quick Summary can only be run on offline Notebooks");
        }

        // are we analyzing a source file or a project?
        let projectWideAnalysis = (notebook.metadata['sourceFile'] as string) === './';
        if (!projectWideAnalysis) {
            throw new Error("Quick Summary can only be run at the Project level");
        }

        // now get the current organization
        let organization = await getCurrentOrganization(this.context);
        if (!organization) {
            throw new Error("Organization not found");
        }

        const authPayload = {
            session: session.accessToken,
            organization: organization,
        };
    
        boostLogging.info(`Starting ${this.command} of Notebook ${notebook.fsPath}`, false);

        let successfullyCompleted = true;
        try
        {
            await this._runQuickSummary(notebook, authPayload);

        } catch (rethrow) {
            successfullyCompleted = false;
            boostLogging.error(`Error during ${this.command} of Project-level Notebook at ${new Date().toLocaleTimeString()}`, false);
            throw rethrow;
        }
        finally {
            boostLogging.info(`Finished ${this.command} of Project-level Notebook at ${new Date().toLocaleTimeString()}`, !usingBoostNotebook);
            }    
    }

    private _parentController : FunctionKernelControllerBase | undefined = undefined;
    private get parentController() : FunctionKernelControllerBase | undefined {
        if (this._parentController) {
            return this._parentController;
        }

        const kernels : Map<string, KernelControllerBase> = this.hostExtension?.kernels;
        if (!kernels) {
            throw new Error("Host Extension or Kernels not initialized");
        }

        for (const [kernelName, kernelController] of kernels) {
            if (!(kernelController instanceof FunctionKernelControllerBase)) {
                continue;
            }
            if (kernelController.outputType !== this._coreOutputType) {
                continue;
            }
            this._parentController = kernelController;
            break;
        }
        if (!this._parentController) {
            throw new Error("Parent Controller not found");
        }

        return this._parentController;
}

    private async _runQuickSummary(
            notebook: BoostNotebook,
            authPayload: any) {

        if (!this.parentController) {
            throw new Error("Parent Controller not found");
        }

        // we don't want to overwrite deep summary, which are far more detailed and useful in general
        let existingSummaryCell = findCellByKernel(notebook, this.outputType) as BoostNotebookCell;
        if (existingSummaryCell && existingSummaryCell.value &&
            existingSummaryCell.metadata?.summaryType) {
            if (existingSummaryCell.metadata.summaryType === "summary") {
                boostLogging.info(`Skipping ${this.command} of Project-level Notebook " +
                                  "because it already has a detailed Summary`, false);
                return;
            } else if (existingSummaryCell.metadata.summaryType === "quick") {
                boostLogging.info(`Rebuilding ${this.command} of Project-level Notebook ` +
                                  `from last quick summary`, false);
            }
        }

        // do the diagnostic collection query
        const targetFolder = vscode.workspace.workspaceFolders?.[0].uri;
        if (!targetFolder) {
            return;
        }
        // we're going to search for everything under our target folder, and let the notebook parsing code filter out what it can't handle
        const searchPattern = new vscode.RelativePattern(
            targetFolder.fsPath,
            "**/*.*"
        );

        // get the files
        const ignorePatterns = buildVSCodeIgnorePattern(targetFolder);
        const uris = await vscode.workspace.findFiles(searchPattern, ignorePatterns);
        const filteredFiles = uris.map((uri) => {
            return path.relative(targetFolder.fsPath,uri.fsPath);
        });

        let offlineSummary = undefined;
        let topSeverityIssues = "[]";

        if (filteredFiles.length !== 0) {
            // get the top 20% of issues (by severity)
            topSeverityIssues = this.getTopSeverityIssues(this.parentController.sourceLevelIssueCollection);
            // boostLogging.debug(`${this.outputType} Top Severity Issues:\n\n${topSeverityIssues}`);
        }
        if (topSeverityIssues === "[]") {
            offlineSummary = this.buildDefaultOfflineSummary(filteredFiles.length);
        }
        // we create a placeholder cell for the input, so we can do processing on the input
        const tempProcessingCell = new BoostNotebookCell(NotebookCellKind.Markup,
            "", "markdown");

        if (filteredFiles.length !== 0 && topSeverityIssues !== "[]") {
            const categorizedData = this.getTableOfIssuesBySeverityAndCategory(this.parentController.sourceLevelIssueCollection);
            // boostLogging.debug(`${this.outputType} Categorized Issues:\n\n${categorizedData}`);

            const payloadQuick = {
                'filelist': filteredFiles,
                'examples': topSeverityIssues,
                
                // eslint-disable-next-line @typescript-eslint/naming-convention
                'issue_categorization': categorizedData,
                ...authPayload
            };

            // execute the quick report service
            const quickResponse = await this.doKernelExecution(notebook, tempProcessingCell, undefined, payloadQuick);
            // assert response.payload['statusCode'] == 200
            if (quickResponse instanceof Error) {
                let throwErr = quickResponse as Error;
                throw throwErr;
            } else if (quickResponse.data instanceof Error) {
                let throwErr = quickResponse.data as Error;
                throw throwErr;
            }
        }

        let targetCell = findCellByKernel(notebook, this.outputType) as BoostNotebookCell;

        if (!targetCell) {
            targetCell = new BoostNotebookCell(NotebookCellKind.Markup, "", "markdown");
            targetCell.initializeMetadata(
                {
                    "id": targetCell.id,
                    "outputType": this.outputType,
                    "summaryType": "quick"
                });
            notebook.addCell(targetCell);
        } else {
            // store quick as the summary type
            targetCell.initializeMetadata({
                ...targetCell.metadata,
                "summaryType": "quick"
            });
        }

        if (filteredFiles.length !== 0 || topSeverityIssues !== "[]") {
            // snap the processed quick report from the temp cell and store it in real notebook
            targetCell.value = tempProcessingCell.outputs[0].items[0].data;

            // we're also going to store the details in the usual output section
            //    for the synthesized cell
            const analysisOutput : SerializedNotebookCellOutput = {
                items: [ { mime: markdownMimeType, data : "" } ],
                metadata : { outputType: this.outputType,
                    details: tempProcessingCell.outputs[0].metadata?.details } };

            targetCell.updateOutputItem(this.outputType, analysisOutput);
        } else {
            targetCell.value = offlineSummary as string;

            // we're not going to store an extra output, since we have no useful analysis or background
        }

        notebook.flushToFS();
    }

    buildDefaultOfflineSummary(fileCount: number) : string {
        let archImpact: string;
        let riskAnalysis: string;
        let custImpact: string;
        let perfIssues: string;
        let riskAssessment: string;
        let highlights: string;
    
        if (fileCount === 0) {
            archImpact = "Unable to assess the project's architecture as no files were available for analysis.";
            riskAnalysis = "With no files available, there are no identified risks at this point.";
            custImpact = "Given the lack of files for analysis, we're unable to comment on potential customer impact.";
            perfIssues = "No performance issues identified due to the absence of files for analysis.";
            riskAssessment = "With no files to review, a risk assessment cannot be performed at this time.";
            highlights = "Unable to provide highlights as no files were available for analysis.";
        } else {
            archImpact = `The analysis of ${fileCount} files in the project's architecture has not revealed any severe issues.`;
            riskAnalysis = `Out of ${fileCount} files, none have been flagged for severe issues.`;
            custImpact = "Based on the analysis, there are no severe issues that could potentially impact customers.";
            perfIssues = "Our analysis did not identify any explicit performance issues in the project files.";
            riskAssessment = `Based on the current analysis of the ${fileCount} files in the project, no severe issues have been found. However, this doesn't guarantee that the project is risk-free.`;
            highlights = `No severe issues were identified in the current analysis of the ${fileCount} project files.`;
        }
    
        const offlineReport = `
Executive Report:

1. **Architectural Impact**: ${archImpact}
2. **Risk Analysis**: ${riskAnalysis}
3. **Potential Customer Impact**: ${custImpact}
4. **Performance Issues**: ${perfIssues}
5. **Risk Assessment**: ${riskAssessment}

Highlights:

- ${highlights}
`;
    
        return offlineReport;
    }    
    
    onKernelOutputItem(
        response: any,
        _ : vscode.NotebookCell | BoostNotebookCell,
        __ : any) : string {

        if (response.summary === undefined) {
            throw new Error("Unexpected missing data from Boost Service");
        }
        return generateCellOutputWithHeader(this.outputHeader, response.summary);
    }

    getTopSeverityIssues(diagnosticCollection: vscode.DiagnosticCollection): string {
        const allDiagnostics: {uri: vscode.Uri, diagnostic: vscode.Diagnostic}[] = [];

        const targetFolder = vscode.workspace.workspaceFolders?.[0].uri;
        if (!targetFolder) {
            throw new Error("Diagnostic Summaries only avaiable within a project");
        }
        
        // Flatten the diagnostics from the diagnostic collection into a single array
        diagnosticCollection.forEach((uri: vscode.Uri, diagnostics: readonly vscode.Diagnostic[]) => {
            diagnostics.forEach(diagnostic => {
                allDiagnostics.push({uri, diagnostic});
            });
        });

        if (allDiagnostics.length === 0) {
            return "[]";
        }
        
        // Sort the array of diagnostics by severity, from highest to lowest
        const sortedDiagnostics = allDiagnostics.sort((a, b) => a.diagnostic.severity - b.diagnostic.severity);

        // Filter the array to only include diagnostics with severity Warning or Error
        const filteredDiagnostics = sortedDiagnostics.filter(item => item.diagnostic.severity <= vscode.DiagnosticSeverity.Warning);

        // Filter out duplicates, keeping only the first occurrence of each unique diagnostic message
        const uniqueDiagnostics = [];
        const messageSet = new Set();
        for (const item of filteredDiagnostics) {
            if (!messageSet.has(item.diagnostic.message)) {
                uniqueDiagnostics.push(item);
                messageSet.add(item.diagnostic.message);
            }
        }

        // Calculate the number of diagnostics that make up the top 20%
        const top20PercentCount = Math.ceil(uniqueDiagnostics.length * 0.2);
        
        // Slice the sorted array to get the top 20% of diagnostics (or at most 20 most serious issues)
        const topSeverityDiagnostics = uniqueDiagnostics.slice(0, Math.min(top20PercentCount, 20));
        
        // Map each diagnostic to an object containing the filename, category, and severity
        const result = topSeverityDiagnostics.map(({uri, diagnostic}) => {
            const { range, message, source, relatedInformation } = diagnostic;
            const filename = path.relative(targetFolder.fsPath, uri.fsPath);
            const category = source || 'Uncategorized';
            
            let severityLabel: string;
            switch (diagnostic.severity) {
                case vscode.DiagnosticSeverity.Error:
                    severityLabel = "Error";
                    break;
                case vscode.DiagnosticSeverity.Warning:
                    severityLabel = "Warning";
                    break;
                case vscode.DiagnosticSeverity.Information:
                    severityLabel = "Information";
                    break;
                case vscode.DiagnosticSeverity.Hint:
                    severityLabel = "Hint";
                    break;
                default:
                    severityLabel = "Unknown";
            }

            return { filename, category, severity: severityLabel, message, relatedInformation };
        });
        
        // Convert the resulting array of objects to a JSON string
        const jsonString = JSON.stringify(result);
        
        return jsonString;
    }

    getTableOfIssuesBySeverityAndCategory(diagnosticCollection: vscode.DiagnosticCollection): string {

        const targetFolder = vscode.workspace.workspaceFolders?.[0].uri;
        if (!targetFolder) {
            throw new Error("Diagnostic Summaries only avaiable within a project");
        }

        const allDiagnostics: {uri: vscode.Uri, diagnostic: vscode.Diagnostic}[] = [];
        
        // Flatten the diagnostics from the diagnostic collection into a single array
        diagnosticCollection.forEach((uri: vscode.Uri, diagnostics: readonly vscode.Diagnostic[]) => {
            diagnostics.forEach(diagnostic => {
                allDiagnostics.push({uri, diagnostic});
            });
        });

        if (allDiagnostics.length === 0) {
            return "[]";
        }
    
        // Initialize an empty object to store counts
        const result: Record<string, Record<string, Record<string, number>>> = {};
    
        // Iterate over all diagnostics
        allDiagnostics.forEach(({uri, diagnostic}) => {
            const { severity, source } = diagnostic;
            const filename = path.relative(targetFolder.fsPath, uri.fsPath);
    
            // Convert severity from enum to string
            let severityString;
            switch (severity) {
                case vscode.DiagnosticSeverity.Error:
                    severityString = 'Error';
                    break;
                case vscode.DiagnosticSeverity.Warning:
                    severityString = 'Warning';
                    break;
                case vscode.DiagnosticSeverity.Information:
                    severityString = 'Information';
                    break;
                case vscode.DiagnosticSeverity.Hint:
                    severityString = 'Hint';
                    break;
                default:
                    severityString = 'Unknown';
            }

            const category = source || 'Uncategorized';

            // If severityString doesn't exist in result, initialize it
            if (!(severityString in result)) {
                result[severityString] = {};
            }

            // If category doesn't exist in severityString, initialize it
            if (!(category in result[severityString])) {
                result[severityString][category] = {};
            }

            // If filename doesn't exist in category, initialize it
            if (!(filename in result[severityString][category])) {
                result[severityString][category][filename] = 0;
            }

            // Increment the count
            result[severityString][category][filename]++;
        });
        
        // Convert the resulting object to a JSON string
        const jsonString = JSON.stringify(result);
        
        return jsonString;
    }
}