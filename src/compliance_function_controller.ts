
import { DiagnosticCollection, ExtensionContext } from 'vscode';
import { BoostConfiguration } from './boostConfiguration';
import { FunctionKernelControllerBase } from './function_base_controller';
import { complianceKernelName, complianceOutputType } from './compliance_controller';

export const complianceFunctionKernelName = complianceKernelName + '_function';
export const complianceFunctionOutputType = complianceOutputType + 'List';

export class BoostComplianceFunctionKernel extends FunctionKernelControllerBase {

	constructor(context: ExtensionContext, onServiceErrorHandler: any, otherThis: any, collection: DiagnosticCollection) {
        super(
            collection,
            complianceFunctionKernelName,
            'Quick source scan for data and privacy compliance issues',
            'Quickly analyzes all targeted source code for data and privacy compliance issues',
            complianceFunctionOutputType,
            "compliance",
            "Data and Privacy Compliance Analysis", 
            context,
            otherThis,
            onServiceErrorHandler,
            );
	}

    public get serviceEndpoint(): string {
        switch (BoostConfiguration.cloudServiceStage)
        {
            case "local":
                return 'http://127.0.0.1:8000/compliance_function';
            case 'dev':
                return 'https://t4so4gqwf5rr5fr7pvlpytvkne0prvcv.lambda-url.us-west-2.on.aws/';
            case "test":
                return 'https://obzwdrxuel32tuozt5vdafb4gy0vjpls.lambda-url.us-west-2.on.aws/';
            case 'staging':
            case 'prod':
            default:
                return 'https://srsybz6dbjz45skdwq6quou4ua0rxbnk.lambda-url.us-west-2.on.aws/';
        }
    }

	dispose(): void {
		super.dispose();
	}
}
