import {
    KernelControllerBase, onServiceErrorHandler
 } from './base_controller';
import { DiagnosticCollection, ExtensionContext, NotebookCell } from 'vscode';
import { BoostConfiguration } from './boostConfiguration';
import { BoostNotebookCell } from './jupyter_notebook';

export const performanceOutputType = 'performanceCode';
export const performanceKernelName = 'performance';

export class BoostPerformanceKernel extends KernelControllerBase {
	constructor(context: ExtensionContext, onServiceErrorHandler: onServiceErrorHandler, otherThis : any, collection: DiagnosticCollection) {
        super(
            collection,
            performanceKernelName,
            'Check Code Performance',
            'Evaluates Performance characteristics of the code',
            performanceOutputType,
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
                return 'http://127.0.0.1:8000/performance';
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
    
    onKernelOutputItem(
        response: any,
        cell : NotebookCell | BoostNotebookCell,
        mimetype : any) : string {

            if (response.analysis === undefined) {
            throw new Error("Unexpected missing data from Boost Service");
        }
        return `\n\n---\n\n### Boost Performance Check\n\nLast Updated: ${this.currentDateTime}\n\n${response.analysis}`;
    }

    localizeError(error: Error): Error {
        error.message = "Boost Performance Analysis failed: " + error.message;
        return error;
    }
}