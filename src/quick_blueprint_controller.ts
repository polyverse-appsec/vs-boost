import * as path from 'path';
import * as fs from 'fs';

import {
    KernelControllerBase
 } from './base_controller';
import { BoostConfiguration } from './boostConfiguration';
import * as vscode from 'vscode';
import { BoostNotebookCell, BoostNotebook, NotebookCellKind } from './jupyter_notebook';
import { boostLogging } from './boostLogging';
import { findCellByKernel, generateCellOutputWithHeader, getAllProjectFiles, getProjectName } from './extension';
import { getCurrentOrganization } from "./authorization";
import { ControllerOutputType } from './controllerOutputTypes';

export const quickBlueprintKernelName = 'quickblueprint';
const quickBlueprintOutputHeader = `Architectural Quick Blueprint`;

export class BoostQuickBlueprintKernel extends KernelControllerBase {
	constructor(context: vscode.ExtensionContext, onServiceErrorHandler: any, otherThis : any, collection: vscode.DiagnosticCollection) {
        super(
            collection,
            quickBlueprintKernelName,
            'Quick Architectural Blueprint Code',
            'Quickly builds an Archiectural Blueprint from hints about project and source code.',
            ControllerOutputType.blueprint,
            quickBlueprintOutputHeader,
            false,
            false,
            context,
            otherThis,
            onServiceErrorHandler);
	}

	dispose(): void {
		super.dispose();
	}

    public get serviceEndpoint(): string {
        switch (BoostConfiguration.cloudServiceStage)
        {
            case "local":
                return 'http://127.0.0.1:8000/draft-blueprint';
            case 'dev':
                return 'https://b7zk2dm2haygvcluz4jx2by3vm0ypljn.lambda-url.us-west-2.on.aws/';
            case "test":
                return 'https://7hcsi442ct5fty7tkw3syxjhka0ehlds.lambda-url.us-west-2.on.aws/';
            case 'staging':
            case 'prod':
            default:
                return 'https://7qpij3jplvcmdaojfumgj32e7e0vcchc.lambda-url.us-west-2.on.aws/';
        }
    }

    // for internal readability, we use a more explicit name to know which endpoint is being used
    get draftServiceEndpoint(): string {
        return this.serviceEndpoint;
    }

    public get quickServiceEndpoint(): string {
        switch (BoostConfiguration.cloudServiceStage)
        {
            case "local":
                return 'http://127.0.0.1:8000/quick-blueprint';
            case 'dev':
                return 'https://c2m6d7mgrgypx3mzktbxoawfpa0acsja.lambda-url.us-west-2.on.aws/';
            case "test":
                return 'https://nvw7caoex6ipyisd7matillvci0eclws.lambda-url.us-west-2.on.aws/';
            case 'staging':
            case 'prod':
            default:
                return 'https://vryv4jotc6rghitxmwaz5whrqm0obehc.lambda-url.us-west-2.on.aws/';
        }
    }

    async executeAll(
        _: (vscode.NotebookCell | BoostNotebookCell)[],
        notebook: vscode.NotebookDocument | BoostNotebook,
        session: vscode.AuthenticationSession,
        forceAnalysisRefresh: boolean = false
    ): Promise<void>  {
        const usingBoostNotebook = notebook instanceof BoostNotebook;

        // for now, we ignore forceAnalysisRefresh - and always re-analyze
        forceAnalysisRefresh = true;

        if (!usingBoostNotebook) {
            throw new Error("Quick Blueprint can only be run on offline Notebooks");
        }

        // are we analyzing a source file or a project?
        let projectWideAnalysis = (notebook.metadata['sourceFile'] as string) === './';
        if (!projectWideAnalysis) {
            throw new Error("Quick Blueprint can only be run at the Project level");
        }

        // now get the current organization
        let organization = await getCurrentOrganization(this.context);
        if (!organization) {
            throw new Error("Organization not found");
        }

        const authPayload = {
            session: session.accessToken,
            organization: organization,
        };
    
        boostLogging.info(`Starting ${this.command} of Notebook ${notebook.fsPath}`, false);

        let successfullyCompleted = true;
        try
        {
            await this._runQuickBlueprintStages(notebook, authPayload);

        } catch (rethrow) {
            successfullyCompleted = false;
            boostLogging.error(`Error during ${this.command} of Project-level Notebook at ${new Date().toLocaleTimeString()}`, false);
            throw rethrow;
        }
        finally {
            boostLogging.info(`Finished ${this.command} of Project-level Notebook at ${new Date().toLocaleTimeString()}`, !usingBoostNotebook);
            }    
    }

    private async _runQuickBlueprintStages(
            notebook: BoostNotebook,
            authPayload: any) {

        // we don't want to overwrite summary blueprints, which are far more detailed and useful in general
        let existingBlueprintCell = findCellByKernel(notebook, ControllerOutputType.blueprint) as BoostNotebookCell;
        if (existingBlueprintCell && existingBlueprintCell.value &&
            existingBlueprintCell.metadata?.blueprintType) {
            if (existingBlueprintCell.metadata.blueprintType === "summary") {
                boostLogging.info(`Skipping ${this.command} of Project-level Notebook " +
                                  "because it already has a detailed Summary blueprint`, false);
                return;
            } else if (existingBlueprintCell.metadata.blueprintType === "quick") {
                boostLogging.info(`Rebuilding ${this.command} of Project-level Notebook " +
                                  "from last quick blueprint`, false);
            }
        }

        // do the core multi-stage processing of Draft first, then Quick blueprint

        // we create a placeholder cell for the input, so we can do processing on the input
        // then we'll take the resulting data and run a 2nd pass with updated cell metadata
        // note: we need to pass an empty string for cell contents, so it isn't injected into the payload
        //    automatically
        const tempProcessingCell = new BoostNotebookCell(NotebookCellKind.Markup,
            "", "markdown");

        const files = await getAllProjectFiles(true);
        const projectName = getProjectName();

        const payloadDraft = {
            'filelist': JSON.stringify(files),
            'projectName': projectName,
            ...authPayload
        };

        // execute the draft blueprint service
        const draftResponse = await this.doKernelExecution(notebook, tempProcessingCell, undefined,
            payloadDraft, this.draftServiceEndpoint);
        // assert response.payload['statusCode'] == 200
        if (draftResponse instanceof Error) {
            let throwErr = draftResponse as Error;
            throw throwErr;
        } else if (draftResponse.data instanceof Error) {
            let throwErr = draftResponse.data as Error;
            throw throwErr;
        }

        if (draftResponse.status !== 1) {
            throw new Error("Unable to create a draft blueprint - please check your project files and try again");
        }

        const fullSourcePath = path.join(
            vscode.workspace.workspaceFolders![0].uri.fsPath,
            draftResponse.details.recommendedSampleSourceFile);
        const sampleCode = !fs.existsSync(fullSourcePath)?"":fs.readFileSync(fullSourcePath, 'utf8');

        const fullProjectFilePath = path.join(
            vscode.workspace.workspaceFolders![0].uri.fsPath,
            draftResponse.details.recommendedProjectDeploymentFile);
        const projectFileContents = !fs.existsSync(fullProjectFilePath)?"":fs.readFileSync(fullProjectFilePath, 'utf8');

        const payloadQuick = {
            'filelist': JSON.stringify(files),
            'projectName': projectName,
            'projectFile': projectFileContents,
            'draftBlueprint': draftResponse.details.draftBlueprint,
            'code': sampleCode,
            ...authPayload
        };

        // execute the draft blueprint service
        const quickResponse = await this.doKernelExecution(notebook, tempProcessingCell, undefined,
            payloadQuick, this.quickServiceEndpoint);
        // assert response.payload['statusCode'] == 200
        if (quickResponse instanceof Error) {
            let throwErr = quickResponse as Error;
            throw throwErr;
        } else if (quickResponse.data instanceof Error) {
            let throwErr = quickResponse.data as Error;
            throw throwErr;
        }

        let targetCell = findCellByKernel(notebook, ControllerOutputType.blueprint) as BoostNotebookCell;
        if (!targetCell) {
            targetCell = new BoostNotebookCell(NotebookCellKind.Markup, "", "markdown");
            targetCell.initializeMetadata({"id": targetCell.id, "outputType": ControllerOutputType.blueprint, "blueprintType": "quick"});
            notebook.addCell(targetCell);
        } else {
            // store quick as the blueprint type
            targetCell.initializeMetadata({
                ...targetCell.metadata,
                "blueprintType": "quick"
            });
        }
        // snap the processed quick blueprint from the temp cell and store it in real notebook
        targetCell.value = tempProcessingCell.outputs[0].items[0].data;

        notebook.flushToFS();
    }

    onKernelOutputItem(
        response: any,
        cell : vscode.NotebookCell | BoostNotebookCell,
        mimetype : any) : string {

        if (response.blueprint === undefined && response.details === undefined) {
            throw new Error("Unexpected missing data from Boost Service");
        }
        return generateCellOutputWithHeader(this.outputHeader, response.blueprint);
    }
}