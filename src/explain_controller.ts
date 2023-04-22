import {
    KernelControllerBase
 } from './base_controller';
import { DiagnosticCollection } from 'vscode';
import { BoostConfiguration } from './boostConfiguration';

export const explainCellMarker = 'explainCode';

export class BoostExplainKernel extends KernelControllerBase {
	constructor(collection: DiagnosticCollection) {
        super(
            collection,
            'polyverse-boost-explain-kernel',
            'Polyverse Boost: Explain Code',
            explainCellMarker,
            false,
            false);
	}

	dispose(): void {
		super.dispose();
	}

    public get serviceEndpoint(): string {
        return BoostConfiguration.localServiceDebug?
            'http://127.0.0.1:8000/explain':
            'https://jorsb57zbzwcxcjzl2xwvah45i0mjuxs.lambda-url.us-west-2.on.aws/';
    }

    onKernelOutputItem(response: any, mimetype : any): string {
        return `### Boost Code Explanation\nLast Updated: ${this.currentDateTime}\n${response.explanation}`;
    }

    localizeError(error: Error): Error {
        error.message = "Boost Code Explanation failed: " + error.message;
        return error;
    }
}