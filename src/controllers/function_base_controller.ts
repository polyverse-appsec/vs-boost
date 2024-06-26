import * as vscode from 'vscode';

import {
    KernelControllerBase
 } from './base_controller';
import * as boostnb from '../data/jupyter_notebook';
import { generateCellOutputWithHeader } from '../extension/extensionUtilities';
import { lineNumberBaseFromCell } from '../extension/vscodeUtilities';
import { DisplayGroupFriendlyName } from '../data/userAnalysisType';
import { ControllerOutputType } from './controllerOutputTypes';
import { boostLogging } from '../utilities/boostLogging';

export class FunctionKernelControllerBase extends KernelControllerBase {

	constructor(
        collection: vscode.DiagnosticCollection,
        kernelId: string,
        kernelLabel: string,
        description: string,
        outputType: ControllerOutputType,
        displayGroup: DisplayGroupFriendlyName,
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
            true,
            true, 
            context,
            otherThis,
            onServiceResponseHandler);

        this.outputHeader = outputHeader;
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

        let markdown = '';
        const baseLineNumber = lineNumberBaseFromCell(cell);

        markdown = this.generateMarkdownOutput(notebook, cell, response.details); 

        return generateCellOutputWithHeader(`${this.outputHeader}`, markdown);
    }

    generateMarkdownOutput(
        _ : vscode.NotebookDocument | boostnb.BoostNotebook,
        __ : vscode.NotebookCell | boostnb.BoostNotebookCell,
        details: any) : string {
        return details?JSON.stringify(details):'';
    }

    readonly serviceSuccess : number = 1;
    readonly serviceFailure : number = 0;

    async handleServiceResponse(
        response: any,
        cell: any,
        outputType : ControllerOutputType,
        usingBoostNotebook: boolean,
        mimetype: any,
        notebook: boostnb.BoostNotebook | vscode.NotebookDocument,
        execution: vscode.NotebookCellExecution | undefined): Promise<any> {

        if (response.status === this.serviceFailure) {
            boostLogging.debug(`${this.command} Boost Cloud Service failed to process request`);
        }

        return await super.handleServiceResponse(response, cell, outputType, usingBoostNotebook, mimetype, notebook, execution);
    }

    onKernelProcessResponseDetails(
        details: any,
        cell : vscode.NotebookCell | boostnb.BoostNotebookCell,
        notebook: vscode.NotebookDocument | boostnb.BoostNotebook) : any {

        //if the details exists, then we will use that as the output as an object
        if (!details || Object.keys(details).length === 0) {
            return {};
        }

        return super.onKernelProcessResponseDetails(details, cell, notebook);
    }

}