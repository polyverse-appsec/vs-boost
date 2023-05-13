import {
    KernelControllerBase, onServiceErrorHandler
 } from './base_controller';
import { DiagnosticCollection, ExtensionContext } from 'vscode';
import { BoostConfiguration } from './boostConfiguration';

export const codeGuidelinesCellMarker = 'guidelinesCode';

export class BoostCodeGuidelinesKernel extends KernelControllerBase {
	constructor(context: ExtensionContext, onServiceErrorHandler: onServiceErrorHandler, otherThis : any, collection: DiagnosticCollection) {
        super(
            collection,
            'polyverse-boost-codeguidelines-kernel',
            'Polyverse Boost: Evaluate Code Guidelines',
            codeGuidelinesCellMarker,
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
                return 'http://127.0.0.1:8000/codeguidelines';
            case 'dev':
                return 'https://4govp5ze7uyio3kjehtarpv24u0nabhw.lambda-url.us-west-2.on.aws/';
            case "test":
                return 'https://5n2t5znpduvacad53c2dibg4du0nrstv.lambda-url.us-west-2.on.aws/';
            case 'staging':
            case 'prod':
            default:
                return 'https://ssmhqxozg6ixnk5abyhnezf5ya0seyby.lambda-url.us-west-2.on.aws/';
        }
    }

    onKernelOutputItem(response: any, mimetype : any): string {
        if (response.analysis === undefined) {
            throw new Error("Unexpected missing data from Boost Service");
        }
        return `### Boost Code Guidelines Evaluation\n\nLast Updated: ${this.currentDateTime}\n\n${response.analysis}`;
    }

    localizeError(error: Error): Error {
        error.message = "Boost Code Guidelines Analysis failed: " + error.message;
        return error;
    }
}