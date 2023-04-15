import { access } from 'fs';
import {
    DEBUG_BOOST_LAMBDA_LOCALLY,
    KernelControllerBase
    } from './base_controller';
import * as vscode from 'vscode';
import axios, { AxiosResponse } from 'axios';
import { NOTEBOOK_TYPE } from './extension';
import { BoostConfiguration } from './boostConfiguration';

//set a helper variable of the base url.  this should eventually be a config setting
const testgenUrl = DEBUG_BOOST_LAMBDA_LOCALLY?
    'http://127.0.0.1:8000/testgen':
    'https://gylbelpkobvont6vpxp4ihw5fm0iwnto.lambda-url.us-west-2.on.aws/';
export class BoostTestgenKernel extends KernelControllerBase {
	constructor(collection: vscode.DiagnosticCollection) {
        super(
            collection,
            'polyverse-boost-testgen-kernel',
            'Polyverse Boost: Generate Test Cases for Code',
            testgenUrl,
            'testGeneration',
            true,
            true);
	}

	dispose(): void {
		super.dispose();
	}

    async onBoostServiceRequest(
        cell : vscode.NotebookCell,
        serviceEndpoint : string,
        payload : any) : Promise<string>
    {
        //get the outputLanguage from the language set on the cell, NOT the language set on the notebook
		let outputLanguage = cell.document.languageId ??
            vscode.workspace.getConfiguration(NOTEBOOK_TYPE, null).get(BoostConfiguration.defaultOutputLanguage);

		//if outputLanguage is undefined, set it to python
		let framework = vscode.window.activeNotebookEditor?.notebook.metadata.testFramework ??
            vscode.workspace.getConfiguration(NOTEBOOK_TYPE, null).get(BoostConfiguration.testFramework);;

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
            vscode.workspace.getConfiguration(NOTEBOOK_TYPE, null).get(BoostConfiguration.defaultOutputLanguage);

        //quick hack. if the returned string has three backwards apostrophes, then it's in markdown format
        if(response.data.testcode.includes('```')){
            mimetype = 'text/markdown';
            return '### Boost Test Generation\n' + response.data.testcode;
        }
        else {
            mimetype.str = 'text/x-' + outputLanguage;
            return response.data.testcode;
        }        
    }
}