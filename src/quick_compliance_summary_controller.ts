import {
    BoostQuickSummaryKernelControllerBase,
} from './quick_summary_controller';

import { complianceKernelName } from './compliance_controller';

import { ControllerOutputType } from './controllerOutputTypes';

import * as vscode from 'vscode';

export const quickComplianceSummaryKernelName = `quick${ControllerOutputType.compliance}`;

export class BoostQuickComplianceSummaryKernel extends BoostQuickSummaryKernelControllerBase {
	constructor(context: vscode.ExtensionContext, onServiceErrorHandler: any, otherThis : any, collection: vscode.DiagnosticCollection)
        {
        super(
            context,
            onServiceErrorHandler,
            otherThis,
            collection,
            complianceKernelName,
            ControllerOutputType.compliance,
            ControllerOutputType.complianceFunction,
            "Compliance");
	}

	dispose(): void {
		super.dispose();
	}
}