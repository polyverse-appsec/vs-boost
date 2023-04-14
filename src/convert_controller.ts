import { access } from 'fs';
import {
    DEBUG_BOOST_LAMBDA_LOCALLY,
    KernelControllerBase
    } from './base_controller';
import * as vscode from 'vscode';
import axios, { AxiosResponse } from 'axios';
import { explainUrl, explainCellMarker } from './explain_controller';
import { NOTEBOOK_TYPE } from './extension';
import { BoostConfiguration } from './boostConfiguration';

//set a helper variable of the base url.  this should eventually be a config setting

// for debugging locally with Chalice
const generateUrl = DEBUG_BOOST_LAMBDA_LOCALLY?
    'http://127.0.0.1:8000/generate':
    'https://ukkqda6zl22nd752blcqlv3rum0ziwnq.lambda-url.us-west-2.on.aws/';

const markdownCodeMarker = '```';
export class BoostConvertKernel extends KernelControllerBase {
	constructor(collection: vscode.DiagnosticCollection) {
        super(
            collection,
            'polyverse-boost-convert-kernel',
            'Polyverse Boost: Convert Legacy Code to New Code',
            generateUrl,
            'generatedCode',
            false,
            true);
	}

	dispose(): void {
		super.dispose();
	}

    async onProcessServiceRequest(
        execution: vscode.NotebookCellExecution,
        cell: vscode.NotebookCell,
        payload : any): Promise<void> {

        // make Boost service request to get explanation of code in english (lingua franca cross-translate),
        //      preparing for conversion
        const response = await this.makeBoostServiceRequest(cell, explainUrl, payload);

        const summarydata = response;
        const outputItems: vscode.NotebookCellOutputItem[] = [];

        const markdownMimetype = 'text/markdown';
        outputItems.push(vscode.NotebookCellOutputItem.text("### Boost Code Explanation\n" + summarydata.explanation, markdownMimetype));

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
            vscode.workspace.getConfiguration(NOTEBOOK_TYPE, null).get(BoostConfiguration.defaultOutputLanguage);
        vscode.window.showInformationMessage(`Output Language is ` + outputLanguage);

        // now take the summary and using axios send it to Boost web service with the summary
        //      in a json object summary=summary
        //    dynamically add extra payload properties
        payload.explanation = summarydata.explanation;
        payload.originalCode = payload.code;
        payload.language = outputLanguage;
        const generatedCode = await this.makeBoostServiceRequest(cell, generateUrl, payload);

        //quick hack. if the returned string has three backwards apostrophes, then it's in markdown format
        let mimetypeCode = 'text/x-' + outputLanguage;
        let header = '';
        if(generatedCode.code.includes(markdownCodeMarker)){
            mimetypeCode = markdownMimetype;
            header = '### Boost Converted Code\n';
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
    }
}