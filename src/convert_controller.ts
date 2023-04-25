import { access } from 'fs';
import {
    KernelControllerBase
    } from './base_controller';
import * as vscode from 'vscode';
import axios, { AxiosResponse } from 'axios';
import { explainCellMarker } from './explain_controller';
import { NOTEBOOK_TYPE } from './extension';
import { BoostConfiguration } from './boostConfiguration';

//set a helper variable of the base url.  this should eventually be a config setting

const markdownCodeMarker = '```';
export class BoostConvertKernel extends KernelControllerBase {
	constructor(collection: vscode.DiagnosticCollection) {
        super(
            collection,
            'polyverse-boost-convert-kernel',
            'Polyverse Boost: Convert Legacy Code to New Code',
            'generatedCode',
            false,
            true);
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
                return 'https://vdcg2nzj2jtzmtzzcmfwbvg4ey0jxghj.lambda-url.us-west-2.on.aws/';
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
        cell: vscode.NotebookCell,
        payload : any): Promise<boolean> {

        // make Boost service request to get explanation of code in english (lingua franca cross-translate),
        //      preparing for conversion
        const response = await this.makeBoostServiceRequest(cell, this.explainEndpoint, payload);

        const summarydata = response;
        const outputItems: vscode.NotebookCellOutputItem[] = [];

        const markdownMimetype = 'text/markdown';
        outputItems.push(vscode.NotebookCellOutputItem.text("### Boost Code Explanation\n\nLast Updated: ${this.currentDateTime}\n\n" + summarydata.explanation, markdownMimetype));

        // we will have one NotebookCellOutput per type of output.
        // first scan the existing outputs of the cell and see if we already have an output of this type
        // if so, replace it
        let existingOutput = cell.outputs.find(output => output.metadata?.outputType === explainCellMarker);
        if (existingOutput) {
            execution.replaceOutputItems(outputItems, existingOutput);
        } else {
            // create a new NotebookCellOutput with the outputItems array
            const output = new vscode.NotebookCellOutput(outputItems, { outputType: explainCellMarker });
            execution.appendOutput(output);
        }

        // now we need to generate the code
        // if not specified on the notebook metadata, then default to the setting in the Extension User Settings
        let outputLanguage = (vscode.window.activeNotebookEditor?.notebook.metadata.outputLanguage) ??
            BoostConfiguration.defaultOutputLanguage;

        // now take the summary and using axios send it to Boost web service with the summary
        //      in a json object summary=summary
        //    dynamically add extra payload properties
        payload.explanation = summarydata.explanation;
        payload.originalCode = payload.code;
        payload.language = outputLanguage;
        const generatedCode = await this.makeBoostServiceRequest(cell, this.serviceEndpoint, payload);

        //quick hack. if the returned string has three backwards apostrophes, then it's in markdown format
        let mimetypeCode = 'text/x-' + outputLanguage;
        let header = '';
        if(generatedCode.code.includes(markdownCodeMarker)){
            mimetypeCode = markdownMimetype;
            header = `### Boost Converted Code\n\nLast Updated: ${this.currentDateTime}\n\n`;
        } 

        const outputItemsCode: vscode.NotebookCellOutputItem[] = [];
        outputItemsCode.push(vscode.NotebookCellOutputItem.text(header + generatedCode.code, mimetypeCode));

        // we will have one NotebookCellOutput per type of output.
        // first scan the existing outputs of the cell and see if we already have an output of this type
        // if so, replace it

        existingOutput = cell.outputs.find(output => output.metadata?.outputType === this.outputType);
        if (existingOutput) {
            execution.replaceOutputItems(outputItemsCode, existingOutput);
        } else {
            // create a new NotebookCellOutput with the outputItems array
            const output = new vscode.NotebookCellOutput(outputItemsCode, { outputType: this.outputType });

            execution.appendOutput(output);
        }
        return true;
    }

    localizeError(error: Error): Error {
        error.message = "Boost Code Conversion failed: " + error.message;
        return error;
    }
}