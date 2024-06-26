import {
    KernelControllerBase
 } from './base_controller';
import { BoostConfiguration } from '../extension/boostConfiguration';
import * as vscode from 'vscode';
import { BoostNotebookCell, BoostNotebook } from '../data/jupyter_notebook';
import { generateCellOutputWithHeader } from '../extension/extensionUtilities';
import {
    ControllerOutputType
} from './controllerOutputTypes';
import {
    DisplayGroupFriendlyName
} from '../data/userAnalysisType';

export const blueprintKernelName = 'blueprint';
const blueprintOutputHeader = 'Architectural Blueprint';

export class BoostArchitectureBlueprintKernel extends KernelControllerBase {
	constructor(context: vscode.ExtensionContext, onServiceResponseHandler: any, otherThis : any, collection: vscode.DiagnosticCollection) {
        super(
            collection,
            blueprintKernelName,
            'Architectural Blueprint Code',
            'Builds Archiectural Blueprint of targeted source code by identifying architectural principles, patterns, licensing, performance, etc.',
            ControllerOutputType.blueprint,
            DisplayGroupFriendlyName.documentation,
            blueprintOutputHeader,
            false,
            false,
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
                return 'http://127.0.0.1:8000/blueprint';
            case 'dev':
                return 'https://67wxr6xq76bj5jiaoct5qjzble0wfmdt.lambda-url.us-west-2.on.aws/';
            case "test":
                return 'https://igmvzc3rb3i7ftqm5ozzhpxa5m0xzuae.lambda-url.us-west-2.on.aws/';
            case 'staging':
            case 'prod':
            default:
                return 'https://hb34ftyxhjnd7jvxbmlsmddct40hvrni.lambda-url.us-west-2.on.aws/';
        }
    }

    readonly kernelMarkdownPrefix = "Architectural Blueprint\n";


    onKernelOutputItem(
        response: any,
        notebook : vscode.NotebookDocument | BoostNotebook,
        cell : vscode.NotebookCell | BoostNotebookCell,
        mimetype : any) : string {

        if (response.blueprint === undefined) {
            throw new Error("Unexpected missing data from Boost Service");
        }
        return generateCellOutputWithHeader(this.outputHeader, response.blueprint);
    }
}