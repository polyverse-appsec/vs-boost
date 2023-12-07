import {
    KernelControllerBase,
    codeMimeType,
    markdownMimeType,
    textMimeType,
    markdownCodeMarker
    } from './base_controller';
import * as vscode from 'vscode';
import { BoostConfiguration } from '../extension/boostConfiguration';
import {
    BoostNotebookCell,
    BoostNotebook
} from '../data/jupyter_notebook';
import { generateCellOutputWithHeader } from '../extension/extensionUtilities';
import { ControllerOutputType } from './controllerOutputTypes';
import { DisplayGroupFriendlyName } from '../data/userAnalysisType';
import { plaintext } from '../utilities/languageMappings';

export const testgenKernelName = 'testgen';
export const testgenOutputHeader = `Test Generation`;

export class BoostTestgenKernel extends KernelControllerBase {
	constructor(
        context: vscode.ExtensionContext,
        onServiceResponseHandler: any,
        otherThis : any,
        collection: vscode.DiagnosticCollection) {

        super(
            collection,
            testgenKernelName,
            'Generate Test Cases for Code',
            'Generates a set of unit Test Cases for testing the targeted source code using a specifie Test Framework',
            ControllerOutputType.testgen,
            DisplayGroupFriendlyName.deepcode,
            testgenOutputHeader,
            true,
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

    async doKernelExecution(
        notebook: vscode.NotebookDocument | BoostNotebook | undefined,
        cell: vscode.NotebookCell | BoostNotebookCell | undefined,
        execution: vscode.NotebookCellExecution | undefined,
        extraPayload: any,
        serviceEndpoint: string = this.serviceEndpoint
    ): Promise<any> {
        if (!cell) {
            return super.doKernelExecution(notebook, cell, execution, extraPayload, serviceEndpoint);
        }

        const usingBoostNotebook = "value" in cell; // if the cell has a value property, then it's a BoostNotebookCell

        // get the outputLanguage from the language set on the cell, NOT the language set on the notebook
		let outputLanguage = usingBoostNotebook?cell.languageId:cell.document.languageId ??
            BoostConfiguration.defaultOutputLanguage;

        if (outputLanguage === plaintext) {
            outputLanguage = BoostConfiguration.defaultOutputLanguage;
        }

        // only set the framework if it's already set
		let framework = usingBoostNotebook?(notebook as BoostNotebook).metadata.testFramework:
            vscode.window.activeNotebookEditor?.notebook.metadata.testFramework;

        //  dynamically add payload properties to send to Boost service
        extraPayload.language = outputLanguage;

        // otherwise don't send it so we can use the best one for the language
        if (framework) {
            extraPayload.framework = framework;
        }

        return super.doKernelExecution(notebook, cell, execution, extraPayload, serviceEndpoint);
    }

    onKernelOutputItem(
        response: any,
        notebook : vscode.NotebookDocument | BoostNotebook,
        cell : vscode.NotebookCell | BoostNotebookCell,
        mimetype : any) : string {

        const usingBoostNotebook = "value" in cell; // if the cell has a value property, then it's a BoostNotebookCell

        // get the outputLanguage from the language set on the cell, NOT the language set on the notebook
        let testLanguage = usingBoostNotebook?cell.languageId:cell.document.languageId ??
            BoostConfiguration.defaultOutputLanguage;

        if (response.testcode === undefined) {
            throw new Error("Unexpected missing test code from Boost Service");
        }

            //quick hack. if the returned string has three backwards apostrophes, then it's in markdown format
        if(response.testcode.includes(markdownCodeMarker)){
            mimetype.str = markdownMimeType;
            return generateCellOutputWithHeader(this.outputHeader, response.testcode);
        }
        else {
            if (testLanguage === 'cpp' || testLanguage === 'c') {
                mimetype.str = textMimeType;
            } else if (testLanguage === plaintext) {
                mimetype.str = textMimeType;
            } else {
                mimetype.str = codeMimeType(testLanguage);
            }
            return response.testcode;
        }        
    }
}