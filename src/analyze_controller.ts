import {
    DEBUG_BOOST_LAMBDA_LOCALLY,
    KernelControllerBase
    } from './base_controller';

//set a helper variable of the base url.  this should eventually be a config setting
const analyzeUrl = DEBUG_BOOST_LAMBDA_LOCALLY?
    'http://127.0.0.1:8000/analyze':
    'https://iyn66vkb6lmlcb4log6d3ah7d40axgqu.lambda-url.us-west-2.on.aws/';
export class BoostAnalyzeKernel extends KernelControllerBase {
	constructor() {
        super(
            'polyverse-boost-analyze-kernel',
            'Polyverse Boost: Analyze Code for Security Vulnerabilities',
            analyzeUrl,
            'bugAnalysis',
            true);
	}

	dispose(): void {
		this.dispose();
	}

    onKernelOutputItem(response: any): string {
        return "### Boost Code Analysis\n" + response.analysis;
    }
}
