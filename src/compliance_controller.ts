import {
    KernelControllerBase
 } from './base_controller';
import { DiagnosticCollection, ExtensionContext } from 'vscode';
import { BoostConfiguration } from './boostConfiguration';

export const complianceCellMarker = 'complianceCode';

export class BoostComplianceKernel extends KernelControllerBase {
	constructor(context: ExtensionContext, collection: DiagnosticCollection) {
        super(
            collection,
            'polyverse-boost-compliance-kernel',
            'Polyverse Boost: Check Compliance',
            complianceCellMarker,
            false,
            false,
            context);
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
    
    onKernelOutputItem(response: any, mimetype : any): string {
        return `### Boost Code Compliance Check\n\nLast Updated: ${this.currentDateTime}\n\n${response.analysis}`;
    }

    localizeError(error: Error): Error {
        error.message = "Boost Code Compliance Analysis failed: " + error.message;
        return error;
    }
}