import {
    KernelControllerBase, onServiceErrorHandler
 } from './base_controller';
import { DiagnosticCollection, ExtensionContext } from 'vscode';
import { BoostConfiguration } from './boostConfiguration';

export const flowDiagramCellMarker = 'flowDiagram';

export class BoostFlowDiagramKernel extends KernelControllerBase {
	constructor(context: ExtensionContext, onServiceErrorHandler: onServiceErrorHandler, otherThis : any, collection: DiagnosticCollection) {
        super(
            collection,
            'polyverse-boost-flowdiagram-kernel',
            'Polyverse Boost: Create Flow Diagrams',
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
                return '';
            case "test":
                return '';
            case 'staging':
            case 'prod':
            default:
                return 'https://b3pflzry5l5wbaenwtdytiv7se0ykzkc.lambda-url.us-west-2.on.aws/';
        }
        
    }
    
    onKernelOutputItem(response: any, mimetype : any): string {
        if (response.diagram === undefined) {
            throw new Error("Unexpected missing data from Boost Service");
        }
        return `### Boost Flow Diagram\n\nLast Updated: ${this.currentDateTime}\n\n${response.diagram}`;
    }

    localizeError(error: Error): Error {
        error.message = "Boost Flow Diagram Generation failed: " + error.message;
        return error;
    }
}