import {
    KernelControllerBase
    } from './base_controller';
import * as vscode from 'vscode';
import { BoostConfiguration } from './boostConfiguration';
import { BoostNotebookCell } from './jupyter_notebook';

export const testgenKernelName = 'testgen';
export const testgenOutputName = 'testGeneration';

export class BoostTestgenKernel extends KernelControllerBase {
	constructor(
        context: vscode.ExtensionContext,
        onServiceErrorHandler: any,
        otherThis : any,
        collection: vscode.DiagnosticCollection) {

        super(
            collection,
            testgenKernelName,
            'Generate Test Cases for Code',
            'Generates a set of unit Test Cases for testing the targeted source code using a specifie Test Framework',
            testgenOutputName,
            true,
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
                return 'http://127.0.0.1:8000/testgen';
            case 'dev':
                return 'https://gylbelpkobvont6vpxp4ihw5fm0iwnto.lambda-url.us-west-2.on.aws/';
            case "test":
                return 'https://j33g2yst4ntz5uzxrmvkafyq5q0iysxr.lambda-url.us-west-2.on.aws/';
            case 'staging':
            case 'prod':
            default:
                return 'https://mqxkx5m7hehbskfvrcfwctbt7y0gghab.lambda-url.us-west-2.on.aws/';
        }
    }

    async onBoostServiceRequest(
        cell : vscode.NotebookCell | BoostNotebookCell,
        serviceEndpoint : string,
        payload : any) : Promise<string>
    {
        const usingBoostNotebook = "value" in cell; // if the cell has a value property, then it's a BoostNotebookCell

        //get the outputLanguage from the language set on the cell, NOT the language set on the notebook
		let outputLanguage = usingBoostNotebook?cell.languageId:cell.document.languageId ??
            BoostConfiguration.defaultOutputLanguage;

		//if outputLanguage is undefined, set it to default setting
        let defaultFramework = BoostConfiguration.testFramework;
		let framework = vscode.window.activeNotebookEditor?.notebook.metadata.testFramework ?? defaultFramework;

        //  dynamically add payload properties to send to Boost service
        payload.language = outputLanguage;
        payload.framework = framework;

        return super.onBoostServiceRequest(cell, serviceEndpoint, payload);
    }

    onKernelOutputItem(
        response: any,
        cell : vscode.NotebookCell | BoostNotebookCell,
        mimetype : any) : string {

        const usingBoostNotebook = "value" in cell; // if the cell has a value property, then it's a BoostNotebookCell

        //get the outputLanguage from the language set on the cell, NOT the language set on the notebook
        let outputLanguage = usingBoostNotebook?cell.languageId:cell.document.languageId ??
            BoostConfiguration.defaultOutputLanguage;

        if (response.testcode === undefined) {
            throw new Error("Unexpected missing test code from Boost Service");
        }

            //quick hack. if the returned string has three backwards apostrophes, then it's in markdown format
        if(response.testcode.includes('```')){
            mimetype = 'text/markdown';
            return `\n\n---\n\n### Boost Test Generation\n\nLast Updated: ${this.currentDateTime}\n\n${response.testcode}`;
        }
        else {
            mimetype.str = 'text/x-' + outputLanguage;
            return response.testcode;
        }        
    }
}