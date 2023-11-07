import {
    KernelControllerBase,
    markdownMimeType,
    codeMimeType,
    markdownCodeMarker,
    textMimeType
    } from './base_controller';
import * as vscode from 'vscode';
import { BoostConfiguration } from '../extension/boostConfiguration';
import { BoostNotebookCell, BoostNotebook } from '../data/jupyter_notebook';
import { boostLogging } from '../utilities/boostLogging';
import { generateCellOutputWithHeader } from '../extension/extensionUtilities';
import { ControllerOutputType } from './controllerOutputTypes';
import { DisplayGroupFriendlyName } from '../data/userAnalysisType';
import { explainOutputHeader, getExplainEndpoint } from './explain_controller';

export const convertKernelName = 'convert';
const convertOutputHeader = `Code Conversion`;

export class BoostConvertKernel extends KernelControllerBase {
	constructor(context: vscode.ExtensionContext, onServiceResponseHandler: any, otherThis : any, collection: vscode.DiagnosticCollection) {
        super(
            collection,
            convertKernelName,
            'Code Conversion Advisor',
            'Ask for advice and samples for converting legacy code to new code',
            ControllerOutputType.convert,
            DisplayGroupFriendlyName.deepcode,
            convertOutputHeader,
            false,
            true,
            context,
            otherThis,
            onServiceResponseHandler);
	}

	dispose(): void {
		super.dispose();
	}

    public get serviceEndpoint(): string {
        switch (BoostConfiguration.cloudServiceStage)
        {
            case "local":
                return 'http://127.0.0.1:8000/generate';
            case 'dev':
                return 'https://ukkqda6zl22nd752blcqlv3rum0ziwnq.lambda-url.us-west-2.on.aws/';
            case "test":
                return 'https://oiymo4efmc2u52vyf3mygcwhre0xjpsd.lambda-url.us-west-2.on.aws/';
            case 'staging':
            case 'prod':
            default:
                return 'https://egw2c7dn5vz3leffr3mfqodx3a0perwp.lambda-url.us-west-2.on.aws/';
        }
    }

    get generateEndpoint(): string {
        return this.serviceEndpoint;
    }

    get explainEndpoint(): string {
        return getExplainEndpoint(BoostConfiguration.cloudServiceStage);
    }

    // override onProcessServiceRequest, since we are making two service requests (explain then generate)
    async onProcessServiceRequest(
        execution: vscode.NotebookCellExecution,
        notebook : vscode.NotebookDocument | BoostNotebook,
        cell: vscode.NotebookCell | BoostNotebookCell,
        payload : any,
        serviceEndpoint: string = this.serviceEndpoint
        ): Promise<boolean> {

        const usingBoostNotebook = "value" in cell;

        const cellId = usingBoostNotebook?
            (cell as BoostNotebookCell).id:
            (cell as vscode.NotebookCell).document.uri.toString();

                // First, get the explanation of the code
        let startTime = Date.now();
        let successfullyCompleted = false;
        let explainResponse;
        try {
            const rawExplainResponse = await super.performServiceRequest(cell, this.explainEndpoint, payload);
            if (rawExplainResponse instanceof Error) {
                throw rawExplainResponse;
            } else if (rawExplainResponse.explanation === undefined) {
                throw new Error("Unexpected missing explanation data from Boost Service");
            }

            let mimetype = { str: markdownMimeType };
            explainResponse = super.handleServiceResponse(rawExplainResponse, cell, ControllerOutputType.explain, usingBoostNotebook, mimetype, notebook, execution);
            successfullyCompleted = true;
        } finally {
            const duration = Date.now() - startTime;
            const minutes = Math.floor(duration / 60000);
            const seconds = ((duration % 60000) / 1000).toFixed(0);

            if (successfullyCompleted) {
                boostLogging.info(`SUCCESS running ${"explain"} update of Notebook ${usingBoostNotebook?(notebook as BoostNotebook).fsPath:notebook.uri.toString()} on cell:${cellId} in ${minutes}m:${seconds.padStart(2, '0')}s`, false);
            } else {
                boostLogging.error(`Error while running ${"explain"} update of Notebook ${usingBoostNotebook?(notebook as BoostNotebook).fsPath:notebook.uri.toString()} on cell:${cellId} in ${minutes}m:${seconds.padStart(2, '0')}s`, false);
            }
        }

        // now we need to generate the code
        // if not specified on the notebook metadata, then default to the setting in the Extension User Settings
        let outputLanguage = this.getOutputLanguage(notebook);

        // now take the summary and using axios send it to Boost web service with the summary
        //      in a json object summary=summary
        //    dynamically add extra payload properties
        payload.explanation = explainResponse.explanation;
        payload.language = outputLanguage;

        successfullyCompleted = false;
        startTime = Date.now();
        try {
            const rawConvertResponse = await super.performServiceRequest(cell, this.generateEndpoint, payload);
            if (rawConvertResponse instanceof Error) {
                throw rawConvertResponse;
            } else if (rawConvertResponse.code === undefined) {
                throw new Error("Unexpected missing code data from Boost Service");
            }

            // if the returned string has three backwards apostrophes, then it's in markdown format
            let mimetypeCode = { str: rawConvertResponse.code.includes(markdownCodeMarker)?markdownMimeType:codeMimeType(outputLanguage) };
            explainResponse = super.handleServiceResponse(rawConvertResponse, cell, ControllerOutputType.convert, usingBoostNotebook, mimetypeCode, notebook, execution);
            successfullyCompleted = true;
        }
        finally {
            const duration = Date.now() - startTime;
            const minutes = Math.floor(duration / 60000);
            const seconds = ((duration % 60000) / 1000).toFixed(0);

            if (successfullyCompleted) {
                boostLogging.info(`SUCCESS running ${this.command} update of Notebook ${usingBoostNotebook?(notebook as BoostNotebook).fsPath:notebook.uri.toString()} on cell:${cellId} in ${minutes}m:${seconds.padStart(2, '0')}s`, false);
            } else {
                boostLogging.error(`Error while running ${this.command} update of Notebook ${usingBoostNotebook?(notebook as BoostNotebook).fsPath:notebook.uri.toString()} on cell:${cellId} in ${minutes}m:${seconds.padStart(2, '0')}s`, false);
            }
        }

        return true;
    }

    onKernelOutputItem(
        response: any,
        notebook : vscode.NotebookDocument | BoostNotebook,
        cell : vscode.NotebookCell | BoostNotebookCell,
        mimetype : any) : string {
        if (response.explanation) {
            mimetype.str = markdownMimeType;
            return generateCellOutputWithHeader(explainOutputHeader, response.explanation);
        } else if (response.code) {
            if(response.code.includes(markdownCodeMarker)){
                mimetype.str = markdownMimeType;
                return generateCellOutputWithHeader(this.outputHeader, response.code);
            } else {
                let outputLanguage = this.getOutputLanguage(notebook);
                if (outputLanguage === 'cpp' || outputLanguage === 'c') {
                    mimetype.str = textMimeType;
                } else if (outputLanguage === 'plaintext') {
                    mimetype.str = codeMimeType(textMimeType);
                } else {
                    mimetype.str = codeMimeType(outputLanguage);
                }
                return response.code;
            }
        } else {
            throw new Error("Unexpected missing data from Boost Service");
        }
    }

    // specialize cell search to include the outputLanguage
    isCellOutputMissingOrError(
        notebook : vscode.NotebookDocument | BoostNotebook,
        cell: vscode.NotebookCell | BoostNotebookCell): boolean {
        // Get result from base class
        if (super.isCellOutputMissingOrError(notebook, cell)) {
            return true;
        }

        // Additional logic specific to derived class: Check if the cell has the correct outputLanguage
        // If the output language doesn't match, it means the output is "missing" for the derived class's purposes.
        return !cell.outputs.some((output: any) => {
            return (output.metadata?.outputType === this.outputType && 
                output.metadata?.outputLanguage === this.getOutputLanguage(notebook));
        });
    }

    getOutputLanguage(notebook: vscode.NotebookDocument | BoostNotebook) : string {

        const usingBoostNotebook = notebook instanceof BoostNotebook;

        // now we need to generate the code
        // if not specified on the notebook metadata, then default to the setting in the Extension User Settings
        let outputLanguage = usingBoostNotebook?
            (notebook.metadata.outputLanguage?notebook.metadata.outputLanguage:BoostConfiguration.defaultOutputLanguage):
            (notebook.metadata.outputLanguage?notebook.metadata.outputLanguage:BoostConfiguration.defaultOutputLanguage);

        return outputLanguage;
    }
    
}