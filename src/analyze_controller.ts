import {
    KernelControllerBase
 } from './base_controller';
import { DiagnosticCollection } from 'vscode';
import { BoostConfiguration } from './boostConfiguration';

//set a helper variable of the base url.  this should eventually be a config setting
export class BoostAnalyzeKernel extends KernelControllerBase {
	constructor(collection: DiagnosticCollection) {
        super(
            collection,
            'polyverse-boost-analyze-kernel',
            'Polyverse Boost: Analyze Code for Security Vulnerabilities',
            'bugAnalysis',
            true,
            true);
	}

    public get serviceEndpoint(): string {
        return BoostConfiguration.localServiceDebug?
            'http://127.0.0.1:8000/analyze':
            'https://iyn66vkb6lmlcb4log6d3ah7d40axgqu.lambda-url.us-west-2.on.aws/';
    }

	dispose(): void {
		super.dispose();
	}

    onKernelOutputItem(response: any): string {
        return "### Boost Code Analysis\n" + response.analysis;
    }
}
