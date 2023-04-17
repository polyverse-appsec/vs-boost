import {
    KernelControllerBase
 } from './base_controller';
import { DiagnosticCollection } from 'vscode';
import { BoostConfiguration } from './boostConfiguration';

//set a helper variable of the base url.  this should eventually be a config setting
export const complianceUrl = BoostConfiguration.localServiceDebug?
    'http://127.0.0.1:8000/compliance':
    'https://q57gtrfpkuzquelgqtnncpjwta0nngfx.lambda-url.us-west-2.on.aws/';

export const complianceCellMarker = 'explainCode';

export class BoostComplianceKernel extends KernelControllerBase {
	constructor(collection: DiagnosticCollection) {
        super(
            collection,
            'polyverse-boost-compliance-kernel',
            'Polyverse Boost: Check Compliance',
            complianceUrl,
            complianceCellMarker,
            false,
            false);
	}

	dispose(): void {
		super.dispose();
	}

    onKernelOutputItem(response: any, mimetype : any): string {
        return "### Boost Code Compliance Analysis\n" + response.analysis;
    }
}