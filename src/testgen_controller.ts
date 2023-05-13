import {
    KernelControllerBase, onServiceErrorHandler
    } from './base_controller';
import * as vscode from 'vscode';
import { BoostConfiguration } from './boostConfiguration';
import axios from 'axios';
import { BoostNotebookCell } from './jupyter_notebook';

export class BoostTestgenKernel extends KernelControllerBase {
	constructor(context: vscode.ExtensionContext, onServiceErrorHandler: onServiceErrorHandler, otherThis : any, collection: vscode.DiagnosticCollection) {
        super(
            collection,
            'testgen',
            'Generate Test Cases for Code',
            'Generates a set of unit Test Cases for testing the targeted source code using a specifie Test Framework',
            'testGeneration',
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
        const usingBoostNotebook = cell instanceof BoostNotebookCell;

        //get the outputLanguage from the language set on the cell, NOT the language set on the notebook
		let outputLanguage = usingBoostNotebook?cell.languageId:cell.document.languageId ??
            BoostConfiguration.defaultOutputLanguage;

		//if outputLanguage is undefined, set it to default setting
        let defaultFramework = BoostConfiguration.testFramework;
		let framework = vscode.window.activeNotebookEditor?.notebook.metadata.testFramework ?? defaultFramework;

        //  dynamically add payload properties to send to Boost service
        payload.language = outputLanguage;
        payload.framework = framework;
        return await axios.post(serviceEndpoint, 
            payload);

    }

    onKernelOutputItem(
        response: any,
        cell : vscode.NotebookCell,
        mimetype : any): string {
        //get the outputLanguage from the language set on the cell, NOT the language set on the notebook
		let outputLanguage = cell.document.languageId ??
            BoostConfiguration.defaultOutputLanguage;

        //quick hack. if the returned string has three backwards apostrophes, then it's in markdown format
        if(response.data.testcode.includes('```')){
            mimetype = 'text/markdown';
            return `### Boost Test Generation\n\nLast Updated: ${this.currentDateTime}\n\n${response.data.testcode}`;
        }
        else {
            mimetype.str = 'text/x-' + outputLanguage;
            return response.data.testcode;
        }        
    }
}