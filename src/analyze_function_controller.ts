import { DiagnosticCollection, ExtensionContext } from 'vscode';
import { BoostConfiguration } from './boostConfiguration';
import { FunctionKernelControllerBase } from './function_base_controller';
import { analyzeKernelName, analyzeOutputType } from './analyze_controller';

export const analyzeFunctionKernelName = analyzeKernelName + '_function';
export const analyzeFunctionOutputType = analyzeOutputType + 'List';

export class BoostAnalyzeFunctionKernel extends FunctionKernelControllerBase {

	constructor(context: ExtensionContext, onServiceErrorHandler: any, otherThis: any, collection: DiagnosticCollection) {
        super(
            collection,
            analyzeKernelName,
            'Quick source scan for security vulnerabilities',
            'Quickly analyzes all targeted source code for security vulnerabiities, bugs and potential design flaws',
            analyzeOutputType,
            "security",
            "Security Analysis",
            context,
            otherThis,
            onServiceErrorHandler,
            );
	}

    public get serviceEndpoint(): string {
        switch (BoostConfiguration.cloudServiceStage)
        {
            case "local":
                return 'http://127.0.0.1:8000/analyze_function';
            case 'dev':
                return 'https://fubldwjkv4nau5qcnbrqilv6ba0dmkcc.lambda-url.us-west-2.on.aws/';
            case "test":
                return 'https://axzomrjvbnlqtkoeyetikjmek40qovdu.lambda-url.us-west-2.on.aws/';
            case 'staging':
            case 'prod':
            default:
                return 'https://scqfjxbrko57bekv4lqkvu24fa0cmapi.lambda-url.us-west-2.on.aws/';
        }
    }

	dispose(): void {
		super.dispose();
	}
}
