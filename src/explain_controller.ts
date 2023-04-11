import * as vscode from 'vscode';
import axios from 'axios';
import {
    DEBUG_BOOST_LAMBDA_LOCALLY,
    KernelControllerBase
    } from './base_controller';

//set a helper variable of the base url.  this should eventually be a config setting

const explainUrl = DEBUG_BOOST_LAMBDA_LOCALLY?
    'http://127.0.0.1:8000/':
    'https://jorsb57zbzwcxcjzl2xwvah45i0mjuxs.lambda-url.us-west-2.on.aws/';

export class BoostExplainKernel extends KernelControllerBase {
	constructor() {
        super(
            'polyverse-boost-explain-kernel',
            'Polyverse Boost: Explain Code',
            explainUrl, 'explainCode');
	}

	dispose(): void {
		this.dispose();
	}

    onKernelOutputItem(response: any): string {
        return "### Boost Code Explanation\n" + response.explanation;
    }
}