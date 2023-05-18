import {
    KernelControllerBase, onServiceErrorHandler
 } from './base_controller';
import { DiagnosticCollection, ExtensionContext } from 'vscode';
import { BoostConfiguration } from './boostConfiguration';

export const summaryCellMarker = 'summary';

export class BoostComplianceKernel extends KernelControllerBase {
	constructor(context: ExtensionContext, onServiceErrorHandler: onServiceErrorHandler, otherThis : any, collection: DiagnosticCollection) {
        super(
            collection,
            'summarize',
            'Summarize Analysis',
            'Summarizes the analysis across cells',
            summaryCellMarker,
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
                return 'http://127.0.0.1:8000/summarize';
            case 'dev':
                return '';
            case "test":
                return '';
            case 'staging':
            case 'prod':
            default:
                return '';
        }
        
    }
    
    onKernelOutputItem(response: any, mimetype : any): string {
        if (response.analysis === undefined) {
            throw new Error("Unexpected missing data from Boost Service");
        }
        return `### Boost Summary\n\nLast Updated: ${this.currentDateTime}\n\n${response.analysis}`;
    }

    localizeError(error: Error): Error {
        error.message = "Boost Summary failed: " + error.message;
        return error;
    }
}