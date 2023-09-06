import { DiagnosticCollection, ExtensionContext } from 'vscode';
import { BoostConfiguration } from '../extension/boostConfiguration';
import { FunctionKernelControllerBase } from './function_base_controller';
import { performanceKernelName } from './performance_controller';
import { ControllerOutputType } from './controllerOutputTypes';
import { DisplayGroupFriendlyName } from '../data/userAnalysisType';

export const performanceFunctionKernelName = performanceKernelName + '_function';

export class BoostPerformanceFunctionKernel extends FunctionKernelControllerBase {

	constructor(context: ExtensionContext, onServiceErrorHandler: any, otherThis: any, collection: DiagnosticCollection) {
        super(
            collection,
            performanceFunctionKernelName,
            'Quick source scan for performance issues',
            'Quickly analyzes all targeted source code for performance issues',
            ControllerOutputType.performanceFunction,
            DisplayGroupFriendlyName.security,
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
                return 'https://smp4ywxcghte7ipzgwxyyiii4m0wfdax.lambda-url.us-west-2.on.aws/';
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
