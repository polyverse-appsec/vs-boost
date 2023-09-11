import {
    KernelControllerBase
 } from './base_controller';
import { DiagnosticCollection, ExtensionContext } from 'vscode';
import * as vscode from 'vscode';
import { BoostConfiguration } from '../extension/boostConfiguration';
import { boostLogging } from '../utilities/boostLogging';
import { BoostNotebookCell, BoostNotebook } from '../data/jupyter_notebook';
import { generateCellOutputWithHeader } from '../extension/extensionUtilities';
import { DisplayGroupFriendlyName } from '../data/userAnalysisType';
import { ControllerOutputType } from './controllerOutputTypes';

export const customProcessKernelName = 'custom';
const customProcessOutputHeader = `Custom Code Analysis`;


export function getServiceEndpoint() {
    switch (BoostConfiguration.cloudServiceStage)
    {
        case "local":
            return 'http://127.0.0.1:8000/customprocess';
        case 'dev':
            return 'https://fudpixnolc7qohinghnum2nlm40wmozy.lambda-url.us-west-2.on.aws/';
        case "test":
            return 'https://t3ficeuoeknvyxfqz6stoojmfu0dfzzo.lambda-url.us-west-2.on.aws/';
        case 'staging':
        case 'prod':
        default:
            return 'https://7ntcvdqj4r23uklomzmeiwq7nq0dhblq.lambda-url.us-west-2.on.aws/';
    }
}

export class BoostCustomProcessKernel extends KernelControllerBase {

    defaultPrompt : string =
    `Analyze this code to identify use of code incompatible with a commercial license, such as any open source license.
    Examples of licenses include BSD, MIT, GPL, LGPL, Apache or other licenses that may conflict with commercial licenses.
    For any identified licenses in the code, provide online web links to relevant license analysis.:

    {code}`;

    _customPrompt : string = this.defaultPrompt;

	constructor(context: ExtensionContext, onServiceErrorHandler: any, otherThis : any, collection: DiagnosticCollection) {
        super(
            collection,
            'custom',
            'Custom Process Code',
            'Uses a custom prompt from user to process the targeted source code',
            ControllerOutputType.customProcess,
            DisplayGroupFriendlyName.deepcode,
            customProcessOutputHeader,
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
        return getServiceEndpoint();
    }
    
    onKernelOutputItem(
        response: any,
        notebook : vscode.NotebookDocument | BoostNotebook,
        cell : vscode.NotebookCell | BoostNotebookCell,
        mimetype : any) : string {

        if (response.analysis === undefined) {
            throw new Error("Unexpected missing data from Boost Service");
        }
        return generateCellOutputWithHeader(this.outputHeader, response.analysis);
    }

    async executeAll(
        cells: vscode.NotebookCell[] | BoostNotebookCell[],
        notebook: vscode.NotebookDocument | BoostNotebook,
        session : vscode.AuthenticationSession,
        forceAnalysisRefresh : boolean = false) : Promise<boolean> {

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
            return super.executeAll(cells, notebook, session, forceAnalysisRefresh);
        } else {
            // write user canceled warning to output, without UI
            boostLogging.warn(`Boost ${this.outputHeader} cancelled by user`, false);
        }
        return true;
    }

    async makeBoostServiceRequest(cell: vscode.NotebookCell | BoostNotebookCell, serviceEndpoint: string, payload: any): Promise<any> {
        // inject the current custom prompt into the payload
        payload = { ...payload,
            prompt: this._customPrompt};

        return super.makeBoostServiceRequest(cell, serviceEndpoint, payload);

    }
}