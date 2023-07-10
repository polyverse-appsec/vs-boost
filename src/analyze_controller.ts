import {
    KernelControllerBase
 } from './base_controller';
import { DiagnosticCollection, ExtensionContext, NotebookCell } from 'vscode';
import { BoostConfiguration } from './boostConfiguration';
import { BoostNotebookCell } from './jupyter_notebook';
import { generateCellOutputWithHeader } from './extension';

export const analyzeKernelName = 'analyze';
export const analyzeOutputType = 'bugAnalysis';

export class BoostAnalyzeKernel extends KernelControllerBase {
	constructor(context: ExtensionContext, onServiceErrorHandler: any, otherThis: any, collection: DiagnosticCollection) {
        super(
            collection,
            analyzeKernelName,
            'Analyze for bug and design flaws',
            'Deep analysis of all targeted source code for security vulnerabiities, bugs and potential design flaws',
            analyzeOutputType,
            true,
            true, 
            context,
            otherThis,
            onServiceErrorHandler);
	}

    public get serviceEndpoint(): string {
        switch (BoostConfiguration.cloudServiceStage)
        {
            case "local":
                return 'http://127.0.0.1:8000/analyze';
            case 'dev':
                return 'https://iyn66vkb6lmlcb4log6d3ah7d40axgqu.lambda-url.us-west-2.on.aws/';
            case "test":
                return 'https://avfacpvmtvwcns7sq3si46noxy0zcyrb.lambda-url.us-west-2.on.aws/';
            case 'staging':
            case 'prod':
            default:
                return 'https://2av3vd7bxvxu3zfymtdgqziuoy0lvpge.lambda-url.us-west-2.on.aws/';
        }
    }

	dispose(): void {
		super.dispose();
	}

    onKernelOutputItem(
        response: any,
        _ : NotebookCell | BoostNotebookCell,
        __ : any) : string {

            if (response.analysis === undefined) {
            throw new Error("Unexpected missing data from Boost Service");
        }
        return generateCellOutputWithHeader("Code Analysis", response.analysis);
    }

    localizeError(error: Error): Error {
        error.message = "Boost Code Analysis failed: " + error.message;
        return error;
    }
}
