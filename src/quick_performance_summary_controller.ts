import {
    BoostQuickSummaryKernelControllerBase,
    quickSummaryKernelNamePrefix
} from './quick_summary_controller';

import { ControllerOutputType } from './controllerOutputTypes';

import * as vscode from 'vscode';
import { performanceFunctionKernelName } from './performance_function_controller';

export const quickPerformanceSummaryKernelName = `${quickSummaryKernelNamePrefix}${performanceFunctionKernelName}`;

export class BoostQuickPerformanceSummaryKernel extends BoostQuickSummaryKernelControllerBase {
	constructor(context: vscode.ExtensionContext, onServiceErrorHandler: any, otherThis : any, collection: vscode.DiagnosticCollection)
        {
        super(
            context,
            onServiceErrorHandler,
            otherThis,
            collection,
            performanceFunctionKernelName,
            ControllerOutputType.performance,
            ControllerOutputType.performanceFunction,
            "Performance");
	}

	dispose(): void {
		super.dispose();
	}
}