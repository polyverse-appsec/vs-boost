import {
    KernelControllerBase
 } from './base_controller';
import { DiagnosticCollection, ExtensionContext, NotebookCell } from 'vscode';
import { BoostConfiguration } from './boostConfiguration';
import { BoostNotebookCell } from './jupyter_notebook';
import { generateCellOutputWithHeader } from './extension';

export const complianceOutputType = 'complianceCode';
export const complianceKernelName = 'compliance';

export class BoostComplianceKernel extends KernelControllerBase {
	constructor(context: ExtensionContext, onServiceErrorHandler: any, otherThis : any, collection: DiagnosticCollection) {
        super(
            collection,
            complianceKernelName,
            'Check Data Compliance',
            'Evaluates Data and Privacy Compliance of the code',
            complianceOutputType,
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
                return 'http://127.0.0.1:8000/compliance';
            case 'dev':
                return 'https://q57gtrfpkuzquelgqtnncpjwta0nngfx.lambda-url.us-west-2.on.aws/';
            case "test":
                return 'https://zqawwovxykxdvcofpgyosfg3fa0hmuxw.lambda-url.us-west-2.on.aws/';
            case 'staging':
            case 'prod':
            default:
                return 'https://7vtdrtujboyw4ft7af7j2aimqi0wzwzd.lambda-url.us-west-2.on.aws/';
        }
        
    }
    
    onKernelOutputItem(
        response: any,
        cell : NotebookCell | BoostNotebookCell,
        mimetype : any) : string {

            if (response.analysis === undefined) {
            throw new Error("Unexpected missing data from Boost Service");
        }
        return generateCellOutputWithHeader(`Code Compliance Check`, response.analysis);
    }

    localizeError(error: Error): Error {
        error.message = "Boost Data Compliance Analysis failed: " + error.message;
        return error;
    }
}