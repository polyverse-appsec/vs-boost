import {
    KernelControllerBase, onServiceErrorHandler
    } from './base_controller';
import * as vscode from 'vscode';
import { explainOutputType } from './explain_controller';
import { BoostConfiguration } from './boostConfiguration';
import { BoostNotebookCell, SerializedNotebookCellOutput, BoostNotebook } from './jupyter_notebook';
import { boostLogging } from './boostLogging';

export const convertOutputType = 'generatedCode';
export const convertKernelName = 'convert';

const markdownCodeMarker = '```';
export class BoostConvertKernel extends KernelControllerBase {
	constructor(context: vscode.ExtensionContext, onServiceErrorHandler: onServiceErrorHandler, otherThis : any, collection: vscode.DiagnosticCollection) {
        super(
            collection,
            convertKernelName,
            'Convert Legacy Code to New Code',
            'Converts targeted source code into a new programming language, using the best practices of the target language',
            convertOutputType,
            false,
            true,
            context,
            otherThis,
            onServiceErrorHandler);
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

    // NOTE: This code is duplicated in explain_controller.cs
    get explainEndpoint(): string {
        switch (BoostConfiguration.cloudServiceStage)
        {
            case "local":
                return 'http://127.0.0.1:8000/explain';
            case 'dev':
                return 'https://jorsb57zbzwcxcjzl2xwvah45i0mjuxs.lambda-url.us-west-2.on.aws/';
            case "test":
                return 'https://r5s6cjvc43jsrqdq3axrhrceya0cumft.lambda-url.us-west-2.on.aws/';
            case 'staging':
            case 'prod':
            default:
                return 'https://vdcg2nzj2jtzmtzzcmfwbvg4ey0jxghj.lambda-url.us-west-2.on.aws/';
        }
    }


    async onProcessServiceRequest(
        execution: vscode.NotebookCellExecution,
        notebook : vscode.NotebookDocument | BoostNotebook,
        cell: vscode.NotebookCell | BoostNotebookCell,
        payload : any): Promise<boolean> {

        const usingBoostNotebook = "value" in cell; // if the cell has a value property, then it's a BoostNotebookCell

        // make Boost service request to get explanation of code in english (lingua franca cross-translate),
        //      preparing for conversion
        const response = await this.makeBoostServiceRequest(cell, this.explainEndpoint, payload);
        if (response instanceof Error) {
            let throwErr = response as Error;
            throw throwErr;
        } else if (response.data instanceof Error) {
            let throwErr = response.data as Error;
            throw throwErr;
        }

        const summarydata = response;
        const markdownMimetype = 'text/markdown';
        const outputText = `### Boost Code Explanation\n\nLast Updated: ${this.currentDateTime}\n\n${summarydata.explanation}`;

        // we will have one NotebookCellOutput per type of output.
        // first scan the existing outputs of the cell and see if we already have an output of this type
        // if so, replace it
        let successfullyCompleted = false;
        let startTime = Date.now();
        const cellId = usingBoostNotebook?
            (cell as BoostNotebookCell).id:
            (cell as vscode.NotebookCell).document.uri.toString();
        try {
            if (usingBoostNotebook) {
                const outputItems : SerializedNotebookCellOutput[] = [ {
                    items: [ { mime: markdownMimetype, data : outputText } ],
                    metadata : { outputType: explainOutputType} } ];
                
                cell.updateOutputItem(explainOutputType, outputItems[0]);
            } else {
                const outputItems: vscode.NotebookCellOutputItem[] = [ vscode.NotebookCellOutputItem.text(outputText, markdownMimetype) ];

                let existingOutput = cell.outputs.find(output => output.metadata?.outputType === explainOutputType);

                if (existingOutput) {
                    execution.replaceOutputItems(outputItems, existingOutput);
                } else {
                    // create a new NotebookCellOutput with the outputItems array
                    const output = new vscode.NotebookCellOutput(outputItems, { outputType: explainOutputType });
                    execution.appendOutput(output);
                }
            }
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
        let outputLanguage = usingBoostNotebook? BoostConfiguration.defaultOutputLanguage:
            (vscode.window.activeNotebookEditor?.notebook.metadata.outputLanguage) ??
            BoostConfiguration.defaultOutputLanguage;

        // now take the summary and using axios send it to Boost web service with the summary
        //      in a json object summary=summary
        //    dynamically add extra payload properties
        payload.explanation = summarydata.explanation;
        payload.originalCode = payload.code;
        payload.language = outputLanguage;

        successfullyCompleted = false;
        startTime = Date.now();
        try {
            const generatedCode = await this.makeBoostServiceRequest(cell, this.serviceEndpoint, payload);
            if (generatedCode instanceof Error) {
                let throwErr = generatedCode as Error;
                throw throwErr;
            } else if (generatedCode === undefined) {
                throw new Error("Unexpected empty result from Boost Service");
            } else if (generatedCode.data instanceof Error) {
                let throwErr = generatedCode.data as Error;
                throw throwErr;
            } else if (generatedCode.code === undefined) {
                throw new Error("Unexpected missing data from Boost Service");
            }

            //quick hack. if the returned string has three backwards apostrophes, then it's in markdown format
            let mimetypeCode = 'text/x-' + outputLanguage;
            let header = '';
            if(generatedCode.code.includes(markdownCodeMarker)){
                mimetypeCode = markdownMimetype;
                header = `### Boost Converted Code\n\nLast Updated: ${this.currentDateTime}\n\n`;
            }
            header = header + generatedCode.code;

            if (usingBoostNotebook) {
                const outputItems : SerializedNotebookCellOutput[] = [ {
                    items: [ { mime: mimetypeCode, data : header } ],
                    metadata : { outputType: this.outputType} } ];
                
                cell.updateOutputItem(this.outputType, outputItems[0]);
            } else {
                const outputItemsCode: vscode.NotebookCellOutputItem[] = [ vscode.NotebookCellOutputItem.text(header, mimetypeCode) ];

                // we will have one NotebookCellOutput per type of output.
                // first scan the existing outputs of the cell and see if we already have an output of this type
                // if so, replace it
                const existingOutput = cell.outputs.find(output => output.metadata?.outputType === this.outputType);
                if (existingOutput) {
                    execution.replaceOutputItems(outputItemsCode, existingOutput);
                } else {
                    // create a new NotebookCellOutput with the outputItems array
                    const output = new vscode.NotebookCellOutput(outputItemsCode, { outputType: this.outputType });

                    execution.appendOutput(output);
                }
            }
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

    localizeError(error: Error): Error {
        error.message = "Boost Code Conversion failed: " + error.message;
        return error;
    }
}