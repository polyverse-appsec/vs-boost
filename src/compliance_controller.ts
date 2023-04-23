import {
    KernelControllerBase
 } from './base_controller';
import { DiagnosticCollection } from 'vscode';
import { BoostConfiguration } from './boostConfiguration';

export const complianceCellMarker = 'explainCode';

export class BoostComplianceKernel extends KernelControllerBase {
	constructor(collection: DiagnosticCollection) {
        super(
            collection,
            'polyverse-boost-compliance-kernel',
            'Polyverse Boost: Check Compliance',
            complianceCellMarker,
            false,
            false);
	}

	dispose(): void {
		super.dispose();
	}

    public get serviceEndpoint(): string {
        switch (BoostConfiguration.cloudServiceStage)
        {
            case "local":
                return 'http://127.0.0.1:8000/compliance';
            case 'prod':
                return 'https://7vtdrtujboyw4ft7af7j2aimqi0wzwzd.lambda-url.us-west-2.on.aws/';
            case 'dev':
            default:
                return 'https://q57gtrfpkuzquelgqtnncpjwta0nngfx.lambda-url.us-west-2.on.aws/';
        }
    }
    
    onKernelOutputItem(response: any, mimetype : any): string {
        return `### Boost Code Compliance Check\nLast Updated: ${this.currentDateTime}\n${response.analysis}`;
    }

    localizeError(error: Error): Error {
        error.message = "Boost Code Compliance Analysis failed: " + error.message;
        return error;
    }
}