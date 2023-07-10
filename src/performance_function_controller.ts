import { DiagnosticCollection, ExtensionContext } from 'vscode';
import { BoostConfiguration } from './boostConfiguration';
import { FunctionKernelControllerBase } from './function_base_controller';
import { performanceKernelName, performanceOutputType } from './performance_controller';

export const performanceFunctionKernelName = performanceKernelName + '_function';
export const performanceFunctionOutputType = performanceOutputType + 'List';

export class BoostPerformanceFunctionKernel extends FunctionKernelControllerBase {

	constructor(context: ExtensionContext, onServiceErrorHandler: any, otherThis: any, collection: DiagnosticCollection) {
        super(
            collection,
            performanceFunctionKernelName,
            'Quick source scan for performance issues',
            'Quickly analyzes all targeted source code for performance issues',
            performanceFunctionOutputType,
            "performance",
            "Performance Analysis", 
            context,
            otherThis,
            onServiceErrorHandler);
	}

    public get serviceEndpoint(): string {
        switch (BoostConfiguration.cloudServiceStage)
        {
            case "local":
                return 'http://127.0.0.1:8000/performance_function';
            case 'dev':
                return 'https://6ucgf5nhzygxehglg5r7nd73640lykwa.lambda-url.us-west-2.on.aws/';
            case "test":
                throw new Error("Not Implemented");
            case 'staging':
            case 'prod':
            default:
                return 'https://vhdpiji3mrr5ass7o5tx5mx5oa0nrjth.lambda-url.us-west-2.on.aws/';
        }
    }

	dispose(): void {
		super.dispose();
	}
}
