import {
    KernelControllerBase, onServiceErrorHandler
 } from './base_controller';
import { DiagnosticCollection, ExtensionContext } from 'vscode';
import * as vscode from 'vscode';
import { BoostConfiguration } from './boostConfiguration';
import { boostLogging } from './boostLogging';

export const customProcessCellMarker = 'customProcessCode';

export class BoostCustomProcessKernel extends KernelControllerBase {

    defaultPrompt : string =
    `Analyze this code to identify use of code incompatible with a commercial license, such as any open source license.
    Examples of licenses include BSD, MIT, GPL, LGPL, Apache or other licenses that may conflict with commercial licenses.
    For any identified licenses in the code, provide online web links to relevant license analysis.:

    {code}`;

    _customPrompt : string = this.defaultPrompt;

	constructor(context: ExtensionContext, onServiceErrorHandler: onServiceErrorHandler, otherThis : any, collection: DiagnosticCollection) {
        super(
            collection,
            'polyverse-boost-custom-kernel',
            'Polyverse Boost: Custom Process Code',
            customProcessCellMarker,
            false,
            false,
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
                return 'http://127.0.0.1:8000/customprocess';
            case 'dev':
                return '';
            case "test":
                return 'https://t3ficeuoeknvyxfqz6stoojmfu0dfzzo.lambda-url.us-west-2.on.aws/';
            case 'staging':
            case 'prod':
            default:
                return '';
        }
        
    }
    
    onKernelOutputItem(response: any, mimetype : any): string {
        if (response.analysis === undefined) {
            throw new Error("Unexpected missing data from Boost Service");
        }
        return `### Boost Code Custom Process\n\nLast Updated: ${this.currentDateTime}\n\n${response.analysis}`;
    }

    localizeError(error: Error): Error {
        error.message = "Boost Code Custom Processing failed: " + error.message;
        return error;
    }

    async executeAll(cells: vscode.NotebookCell[], notebook: vscode.NotebookDocument, session : vscode.AuthenticationSession) {

        const userInput = await vscode.window.showInputBox({
            value: this._customPrompt,
            prompt: 'Enter your analysis prompt',
            placeHolder: this._customPrompt,
        });
    
        if (userInput !== undefined) {
            // if user blanked out the prompt, use the default
            if (userInput.trim() === '') {
                this._customPrompt = this.defaultPrompt;
            } else {
                this._customPrompt = userInput;
            }
            return super.executeAll(cells, notebook, session);
        } else {
            // write user canceled warning to output, without UI
            boostLogging.warn("Boost Code Custom Processing cancelled by user", false);
        }
    }

    async makeBoostServiceRequest(cell: vscode.NotebookCell, serviceEndpoint: string, payload: any): Promise<any> {
        // inject the current custom prompt into the payload
        payload = { ...payload,
            prompt: this._customPrompt};

        return super.makeBoostServiceRequest(cell, serviceEndpoint, payload);

    }
}