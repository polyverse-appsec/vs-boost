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
import { generateCellOutputWithHeader, cleanCellOutput } from '../extension/extensionUtilities';
import { ControllerOutputType } from './controllerOutputTypes';
import { DisplayGroupFriendlyName } from '../data/userAnalysisType';

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

    async doKernelExecution(
        notebook: vscode.NotebookDocument | BoostNotebook | undefined,
        cell: vscode.NotebookCell | BoostNotebookCell | undefined,
        execution: vscode.NotebookCellExecution | undefined,
        extraPayload: any,
        serviceEndpoint: string = this.serviceEndpoint
    ): Promise<any> {

        if (notebook) {
            extraPayload.language = this.getOutputLanguage(notebook!);
        }

        const usingBoostNotebook = notebook instanceof BoostNotebook;

        const explanation = this.getCellOutput(cell!, ControllerOutputType.explain);
        // if empty or error, we'll error the code conversion
        if (!explanation || explanation.trim().length === 0) {
            throw new Error("Unable to convert code. Please make sure you have generated Explanation or Documentaiton first.");
        }

        extraPayload.explanation = cleanCellOutput(explanation);

        return super.doKernelExecution(notebook, cell, execution, extraPayload, serviceEndpoint);
    }

    onKernelOutputItem(
        response: any,
        notebook : vscode.NotebookDocument | BoostNotebook,
        cell : vscode.NotebookCell | BoostNotebookCell,
        mimetype : any) : string {

        if (!response.code) {
            throw new Error("Unexpected missing data from Boost Service");
        }
        if(response.code.includes(markdownCodeMarker)){
            mimetype.str = markdownMimeType;
            return generateCellOutputWithHeader(this.outputHeader, response.code);
        } else {
            let outputLanguage = this.getOutputLanguage(notebook);
            if (outputLanguage === 'cpp' || outputLanguage === 'c') {
                mimetype.str = textMimeType;
            } else if (outputLanguage === 'plaintext') {
                mimetype.str = textMimeType;
            } else {
                mimetype.str = codeMimeType(outputLanguage);
            }
            return response.code;
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