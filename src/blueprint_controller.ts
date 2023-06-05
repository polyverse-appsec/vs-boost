import {
    KernelControllerBase, onServiceErrorHandler
 } from './base_controller';
import { DiagnosticCollection, ExtensionContext} from 'vscode';
import { BoostConfiguration } from './boostConfiguration';
import * as vscode from 'vscode';
import { boostLogging } from './boostLogging';
import { TextDecoder } from 'util';
import { BoostNotebook, BoostNotebookCell } from './jupyter_notebook';

export const blueprintCellMarker = 'archblueprintCode';

export class BoostArchitectureBlueprintKernel extends KernelControllerBase {
	constructor(context: vscode.ExtensionContext, onServiceErrorHandler: onServiceErrorHandler, otherThis : any, collection: vscode.DiagnosticCollection) {
        super(
            collection,
            'blueprint',
            'Architectural Blueprint Code',
            'Builds Archiectural Blueprint of targeted source code by identifying architectural principles, patterns, licensing, performance, etc.',
            blueprintCellMarker,
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

    readonly kernelMarkdownPrefix = "### Boost Architectural Blueprint\n";

    onKernelOutputItem(response: any): string {
        if (response.blueprint === undefined) {
            throw new Error("Unexpected missing data from Boost Service");
        }
        return `${this.kernelMarkdownPrefix}\n\nLast Updated: ${this.currentDateTime}\n\n${response.blueprint}`;
    }

    localizeError(error: Error): Error {
        error.message = "Boost Architectural Blueprint failed: " + error.message;
        return error;
    }
}