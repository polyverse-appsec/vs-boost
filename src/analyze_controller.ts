import {
    KernelControllerBase
 } from './base_controller';
import { DiagnosticCollection, ExtensionContext } from 'vscode';
import { BoostConfiguration } from './boostConfiguration';

//set a helper variable of the base url.  this should eventually be a config setting
export class BoostAnalyzeKernel extends KernelControllerBase {
	constructor(context: ExtensionContext, collection: DiagnosticCollection) {
        super(
            collection,
            'polyverse-boost-analyze-kernel',
            'Polyverse Boost: Analyze Code for Security Vulnerabilities',
            'bugAnalysis',
            true,
            true, 
            context);
	}

    public get serviceEndpoint(): string {
        switch (BoostConfiguration.cloudServiceStage)
        {
            case "local":
                return 'http://127.0.0.1:8000/analyze';
            case 'dev':
                return 'https://iyn66vkb6lmlcb4log6d3ah7d40axgqu.lambda-url.us-west-2.on.aws/';
            case "test":
                return 'https://avfacpvmtvwcns7sq3si46noxy0zcyrb.lambda-url.us-west-2.on.aws/';
            case 'staging':
            case 'prod':
            default:
                return 'https://2av3vd7bxvxu3zfymtdgqziuoy0lvpge.lambda-url.us-west-2.on.aws/';
        }
    }

	dispose(): void {
		super.dispose();
	}

    onKernelOutputItem(response: any): string {
        return `### Boost Code Analysis\n\nLast Updated: ${this.currentDateTime}\n\n${response.analysis}`;
    }

    localizeError(error: Error): Error {
        error.message = "Boost Code Analysis failed: " + error.message;
        return error;
    }
}
