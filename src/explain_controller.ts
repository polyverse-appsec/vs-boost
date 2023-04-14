import {
    KernelControllerBase,
    DEBUG_BOOST_LAMBDA_LOCALLY
 } from './base_controller';
import { DiagnosticCollection } from 'vscode';

//set a helper variable of the base url.  this should eventually be a config setting
export const explainUrl = DEBUG_BOOST_LAMBDA_LOCALLY?
    'http://127.0.0.1:8000/explain':
    'https://jorsb57zbzwcxcjzl2xwvah45i0mjuxs.lambda-url.us-west-2.on.aws/';

export const explainCellMarker = 'explainCode';

export class BoostExplainKernel extends KernelControllerBase {
	constructor(collection: DiagnosticCollection) {
        super(
            collection,
            'polyverse-boost-explain-kernel',
            'Polyverse Boost: Explain Code',
            explainUrl,
            explainCellMarker,
            false,
            false);
	}

	dispose(): void {
		super.dispose();
	}

    onKernelOutputItem(response: any, mimetype : any): string {
        return "### Boost Code Explanation\n" + response.explanation;
    }
}