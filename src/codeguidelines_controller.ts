import {
    KernelControllerBase
 } from './base_controller';
import { DiagnosticCollection } from 'vscode';
import { BoostConfiguration } from './boostConfiguration';

export const codeGuidelinesCellMarker = 'guidelinesCode';

export class BoostCodeGuidelinesKernel extends KernelControllerBase {
	constructor(collection: DiagnosticCollection) {
        super(
            collection,
            'polyverse-boost-codeguidelines-kernel',
            'Polyverse Boost: Evaluate Code Guidelines',
            codeGuidelinesCellMarker,
            false,
            false);
	}

	dispose(): void {
		super.dispose();
	}

    public get serviceEndpoint(): string {
        return BoostConfiguration.localServiceDebug?
            'http://127.0.0.1:8000/codeguidelines':
            'https://4govp5ze7uyio3kjehtarpv24u0nabhw.lambda-url.us-west-2.on.aws/';
    }

    onKernelOutputItem(response: any, mimetype : any): string {
        return `### Boost Code Guidelines Evaluation\nLast Updated: ${this.currentDateTime}\n${response.analysis}`;
    }

    localizeError(error: Error): Error {
        error.message = "Boost Code Guidelines Analysis failed: " + error.message;
        return error;
    }
}