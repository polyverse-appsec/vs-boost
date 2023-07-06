import {
    KernelControllerBase, onServiceErrorHandler
 } from './base_controller';
import { BoostConfiguration } from './boostConfiguration';
import * as vscode from 'vscode';
import { BoostNotebookCell } from './jupyter_notebook';

export const quickBlueprintOutputType = 'quickblueprintCode';
export const quickBlueprintKernelName = 'quickblueprint';

export class BoostQuickBlueprintKernel extends KernelControllerBase {
	constructor(context: vscode.ExtensionContext, onServiceErrorHandler: onServiceErrorHandler, otherThis : any, collection: vscode.DiagnosticCollection) {
        super(
            collection,
            quickBlueprintKernelName,
            'Quick Architectural Blueprint Code',
            'Quickly builds an Archiectural Blueprint from hints about project and source code.',
            quickBlueprintOutputType,
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
                return 'http://127.0.0.1:8000/draft-blueprint';
            case 'dev':
                return 'https://b7zk2dm2haygvcluz4jx2by3vm0ypljn.lambda-url.us-west-2.on.aws/';
            case "test":
                throw new Error("Not implememted")
            case 'staging':
            case 'prod':
            default:
                return 'https://7qpij3jplvcmdaojfumgj32e7e0vcchc.lambda-url.us-west-2.on.aws/';
        }
    }

    public get quickServiceEndpoint(): string {
        switch (BoostConfiguration.cloudServiceStage)
        {
            case "local":
                return 'http://127.0.0.1:8000/quick-blueprint';
            case 'dev':
                return 'https://c2m6d7mgrgypx3mzktbxoawfpa0acsja.lambda-url.us-west-2.on.aws/';
            case "test":
                throw new Error("Not implememted")
            case 'staging':
            case 'prod':
            default:
                return 'https://vryv4jotc6rghitxmwaz5whrqm0obehc.lambda-url.us-west-2.on.aws/';
        }
    }

    readonly kernelMarkdownPrefix = "### Boost Architectural Quick Blueprint\n";


    onKernelOutputItem(
        response: any,
        cell : vscode.NotebookCell | BoostNotebookCell,
        mimetype : any) : string {

        if (response.blueprint === undefined) {
            throw new Error("Unexpected missing data from Boost Service");
        }
        return `${this.kernelMarkdownPrefix}\n\nLast Updated: ${this.currentDateTime}\n\n${response.blueprint}`;
    }

    localizeError(error: Error): Error {
        error.message = "Boost Architectural Quick Blueprint failed: " + error.message;
        return error;
    }
}