import {
    KernelControllerBase
 } from './base_controller';
import { DiagnosticCollection, ExtensionContext} from 'vscode';
import { BoostConfiguration } from './boostConfiguration';

export const explainCellMarker = 'explainCode';

export class BoostExplainKernel extends KernelControllerBase {
	constructor(context: ExtensionContext, collection: DiagnosticCollection) {
        super(
            collection,
            'polyverse-boost-explain-kernel',
            'Polyverse Boost: Explain Code',
            explainCellMarker,
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
                return 'http://127.0.0.1:8000/explain';
            case 'dev':
                return 'https://jorsb57zbzwcxcjzl2xwvah45i0mjuxs.lambda-url.us-west-2.on.aws/';
            case "test":
                return 'https://r5s6cjvc43jsrqdq3axrhrceya0cumft.lambda-url.us-west-2.on.aws/';
            case 'staging':
            case 'prod':
            default:
                return 'https://vdcg2nzj2jtzmtzzcmfwbvg4ey0jxghj.lambda-url.us-west-2.on.aws/';
        }
    }

    onKernelOutputItem(response: any, mimetype : any): string {
        return `### Boost Code Explanation\n\nLast Updated: ${this.currentDateTime}\n\n${response.explanation}`;
    }

    localizeError(error: Error): Error {
        error.message = "Boost Code Explanation failed: " + error.message;
        return error;
    }
}