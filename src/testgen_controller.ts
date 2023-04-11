import { access } from 'fs';
import {
    DEBUG_BOOST_LAMBDA_LOCALLY,
    KernelControllerBase
    } from './base_controller';
import * as vscode from 'vscode';
import axios, { AxiosResponse } from 'axios';

//set a helper variable of the base url.  this should eventually be a config setting
const testgenUrl = DEBUG_BOOST_LAMBDA_LOCALLY?
    'http://127.0.0.1:8000/testgen':
    'https://gylbelpkobvont6vpxp4ihw5fm0iwnto.lambda-url.us-west-2.on.aws/';
export class BoostTestgenKernel extends KernelControllerBase {
	constructor() {
        super(
            'polyverse-boost-testgen-kernel',
            'Polyverse Boost: Generate Test Cases for Code',
            testgenUrl,
            'testGeneration',
            true);
	}

	dispose(): void {
		this.dispose();
	}

    async onBoostServiceRequest(
        cell : vscode.NotebookCell,
        code : string,
        accessToken : string) : Promise<string>
    {
        //get the outputLanguage from the language set on the cell, NOT the language set on the notebook
		let outputLanguage = cell.document.languageId ?? 'python';

		//if outputLanguage is undefined, set it to python
		let framework = vscode.window.activeNotebookEditor?.notebook.metadata.testFramework ??
            '';

        // now take the summary and using axios send it to Boost web service with
        //  the summary in a json object summary=summary
        return await axios.post(testgenUrl, 
            { code: code, session: accessToken, language: outputLanguage, framework: framework});

    }

    onKernelOutputItem(
        response: any,
        cell : vscode.NotebookCell,
        mimetype : any): string {
        //get the outputLanguage from the language set on the cell, NOT the language set on the notebook
		let outputLanguage = cell.document.languageId ?? 'python';

        //quick hack. if the returned string has three backwards apostrophes, then it's in markdown format
        if(response.testcode.includes('```')){
            mimetype = 'text/markdown';
            return '### Boost Test Generation\n' + response.testcode;
        }
        else {
            mimetype.str = 'text/x-' + outputLanguage;
            return response.testcode;
        }        
    }
}