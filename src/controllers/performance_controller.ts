import {
    KernelControllerBase
 } from './base_controller';
import { DiagnosticCollection, ExtensionContext, NotebookCell } from 'vscode';
import { BoostConfiguration } from '../extension/boostConfiguration';
import { BoostNotebookCell } from '../data/jupyter_notebook';
import { generateCellOutputWithHeader } from '../extension/extension';
import { ControllerOutputType } from './controllerOutputTypes';

export const performanceKernelName = 'performance';
const performanceOutputHeader = `Performance Analysis`;

export class BoostPerformanceKernel extends KernelControllerBase {
	constructor(context: ExtensionContext, onServiceErrorHandler: any, otherThis : any, collection: DiagnosticCollection) {
        super(
            collection,
            performanceKernelName,
            'Check Code Performance',
            'Evaluates Performance characteristics of the code',
            ControllerOutputType.performance,
            performanceOutputHeader,
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
                return 'https://kh5r75yzyxe3idb223bei7tzni0vdyab.lambda-url.us-west-2.on.aws/';
            case "test":
                return 'https://7jbcpiwhdx4yesneiujibmccem0ceazu.lambda-url.us-west-2.on.aws/';
            case 'staging':
            case 'prod':
            default:
                return 'https://zr4gcodfteyi3zi5skcqnx2fge0rnjdk.lambda-url.us-west-2.on.aws/';
        }
        
    }
    
    onKernelOutputItem(
        response: any,
        cell : NotebookCell | BoostNotebookCell,
        mimetype : any) : string {

            if (response.analysis === undefined) {
            throw new Error("Unexpected missing data from Boost Service");
        }
        return generateCellOutputWithHeader(this.outputHeader, response.analysis);
    }
}