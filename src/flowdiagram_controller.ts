import {
    KernelControllerBase, onServiceErrorHandler
 } from './base_controller';
import { DiagnosticCollection, ExtensionContext } from 'vscode';
import { BoostConfiguration } from './boostConfiguration';

export const flowDiagramCellMarker = 'flowDiagram';
export const flowDiagramKernelName = 'flowdiagram';

export class BoostFlowDiagramKernel extends KernelControllerBase {
	constructor(context: ExtensionContext, onServiceErrorHandler: onServiceErrorHandler, otherThis : any, collection: DiagnosticCollection) {
        super(
            collection,
            flowDiagramKernelName,
            'Create Flow Diagrams',
            'Creates a flow diagram from the code',
            flowDiagramCellMarker,
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
                return 'http://127.0.0.1:8000/flowdiagram';
            case 'dev':
                return 'https://54t2jblqus2ou7letg3g2eph7y0aydtk.lambda-url.us-west-2.on.aws/';
            case "test":
                return 'https://a72sw3ffonfcjpq6unrift476e0okcgq.lambda-url.us-west-2.on.aws/';
            case 'staging':
            case 'prod':
            default:
                return 'https://b3pflzry5l5wbaenwtdytiv7se0ykzkc.lambda-url.us-west-2.on.aws/';
        }
        
    }
    
    onKernelOutputItem(response: any, mimetype : any): string {
        if (response.analysis === undefined) {
            throw new Error("Unexpected missing data from Boost Service");
        }
        return `\n\n---\n\n### Boost Flow Diagram\n\nLast Updated: ${this.currentDateTime}\n\n${response.analysis}`;
    }

    localizeError(error: Error): Error {
        error.message = "Boost Flow Diagram Generation failed: " + error.message;
        return error;
    }
}