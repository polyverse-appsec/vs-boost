import {
    BoostQuickSummaryKernelControllerBase,
} from './quick_summary_controller';

import { ControllerOutputType } from './controllerOutputTypes';

import * as vscode from 'vscode';
import { performanceKernelName } from './performance_controller';

export const quickPerformanceSummaryKernelName = `quick${ControllerOutputType.performance}`;

export class BoostQuickPerformanceSummaryKernel extends BoostQuickSummaryKernelControllerBase {
	constructor(context: vscode.ExtensionContext, onServiceErrorHandler: any, otherThis : any, collection: vscode.DiagnosticCollection)
        {
        super(
            context,
            onServiceErrorHandler,
            otherThis,
            collection,
            performanceKernelName,
            ControllerOutputType.performance,
            ControllerOutputType.performanceFunction,
            "Performance");
	}

	dispose(): void {
		super.dispose();
	}
}