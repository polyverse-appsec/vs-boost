import * as fs from 'fs';
import * as path from 'path';

import {
    DiagnosticCollection,
    ExtensionContext,
    NotebookCell,
    NotebookDocument,
    NotebookCellExecution,
    Uri,
    workspace,
} from 'vscode';
import { BoostConfiguration } from '../extension/boostConfiguration';
import { FunctionKernelControllerBase } from './function_base_controller';
import { ControllerOutputType } from './controllerOutputTypes';
import { DisplayGroupFriendlyName } from '../data/userAnalysisType';
import { convertKernelName } from './convert_controller';
import { BoostNotebookCell, BoostNotebook } from '../data/jupyter_notebook';
import { getBoostFile, BoostFileOptions, BoostFileType } from '../extension/extension';
import { errorToString } from '../utilities/error';
import { cleanCellOutput } from '../extension/extensionUtilities';
import { fullPathFromSourceFile } from '../utilities/files';

export const convertFunctionKernelName = convertKernelName + '_function';

export class BoostConvertFunctionKernel extends FunctionKernelControllerBase {

	constructor(context: ExtensionContext, onServiceResponseHandler: any, otherThis: any, collection: DiagnosticCollection) {
        super(
            collection,
            convertFunctionKernelName,
            'Generate New Code from Existing Code',
            'Convert legacy code to new code changing language, libraries, and frameworks',
            ControllerOutputType.convertFunction,
            DisplayGroupFriendlyName.generate,
            "Generate",
            context,
            otherThis,
            onServiceResponseHandler,
            );
	}

    public get serviceEndpoint(): string {
        switch (BoostConfiguration.cloudServiceStage)
        {
            case "local":
                return 'http://127.0.0.1:8000/convert_code';
            case 'dev':
                return 'https://7ir6xpnlnmrs35h4udftdmqrum0fqxrb.lambda-url.us-west-2.on.aws/';
            case "test":
                return 'https://gq7pbc3hqd662tjlarkzxr7w740kuink.lambda-url.us-west-2.on.aws/';
            case 'staging':
            case 'prod':
            default:
                return 'https://wk32ksn6ptwr6m66wsqf6r7opa0tdrkp.lambda-url.us-west-2.on.aws/';
        }
    }

	dispose(): void {
		super.dispose();
	}

    async doKernelExecution(
        notebook: NotebookDocument | BoostNotebook | undefined,
        cell: NotebookCell | BoostNotebookCell | undefined,
        execution: NotebookCellExecution | undefined,
        extraPayload: any,
        serviceEndpoint: string = this.serviceEndpoint
    ): Promise<any> {

        if (notebook) {
            extraPayload.language = this.getOutputLanguage(notebook!);
        }

        const usingBoostNotebook = notebook instanceof BoostNotebook;

        const source = notebook?.metadata?.['sourceFile'] as string;
        if (!source) {
            throw new Error(`Unable to convert code; missing original source file in Notebook: ${notebook?usingBoostNotebook?(notebook as BoostNotebook).fsPath:notebook.uri.toString():"*In Memory*"}`);
        }
        extraPayload.originalFilename = source;

        return super.doKernelExecution(notebook, cell, execution, extraPayload, serviceEndpoint);
    }

    async onBoostServiceRequest(
        cell : NotebookCell | BoostNotebookCell,
        serviceEndpoint : string,
        payload : any) : Promise<string>
    {
        const explanation = this.getCellOutput(cell, ControllerOutputType.explain);
        // if empty or error, we'll error the code conversion
        if (!explanation || explanation.trim().length === 0) {
            throw new Error("Unable to convert code. Please make sure you have generated Explanation or Documentaiton first.");
        }

        payload.explanation = cleanCellOutput(explanation);

        return super.onBoostServiceRequest(cell, serviceEndpoint, payload);
    }

    getOutputLanguage(notebook: NotebookDocument | BoostNotebook) : string {

        const usingBoostNotebook = notebook instanceof BoostNotebook;

        // now we need to generate the code
        // if not specified on the notebook metadata, then default to the setting in the Extension User Settings
        let outputLanguage = usingBoostNotebook?
            (notebook.metadata.outputLanguage?notebook.metadata.outputLanguage:BoostConfiguration.defaultOutputLanguage):
            (notebook.metadata.outputLanguage?notebook.metadata.outputLanguage:BoostConfiguration.defaultOutputLanguage);

        return outputLanguage;
    }

    onKernelProcessResponseDetails(details: any, cell: NotebookCell | BoostNotebookCell, notebook: NotebookDocument | BoostNotebook) {
        const usingBoostNotebook = notebook instanceof BoostNotebook;
        /*
        convert_code = {
            "name": "convert_code",
            "description": "The API that will convert code from one language to another",
            "parameters": {
                "type": "object",
                "properties": {
                    "convertedCode": {
                        "type": "string",
                        "description": "The code that was converted"
                    },
                    "issuesDuringConversion": {
                        "type": "array",
                        "description": "List of errors, warnings or issues encountered while performing conversion.",
                        "items": {
                            "type": "string",
                            "description": "An error or warning or problem with performing a perfect logic conversion or an issue requiring followup."
                        }
                    },
                    "convertedFileExtension": {
                        "type": "string",
                        "description": "The file extension for the converted filed"
                    },
                    "recommendedConvertedFilenameBase": {
                        "type": "string",
                        "description": "The recommended filename base for the converted file"
                    },
                }
            }
        };
        */

        const convertedCode = ('convertedCode' in details)?details['convertedCode']:undefined;
        const issuesDuringConversion : string[] = ('issuesDuringConversion' in details)?details['issuesDuringConversion']:undefined;

        // we're going to write the cell conversion file out to a hidden sub-folder with the cell as a file
        if (convertedCode) {
            let convertedPath;
            if (path.isAbsolute(details['generatedCodeWorkingPath'])) {
                convertedPath = details['generatedCodeWorkingPath'];
            } else {
                convertedPath = Uri.joinPath(workspace.workspaceFolders![0].uri, details['generatedCodeWorkingPath']).fsPath;
            }
            const convertedFolderPath = path.dirname(convertedPath);
            try {
                // create the source working folder first
                fs.mkdirSync(convertedFolderPath, { recursive: true });
                // then write the cell conversion into it
                fs.writeFileSync(convertedPath, convertedCode);
            } catch (error : any) {
                throw new Error(`Unable to save converted code to ${convertedPath}: ${errorToString(error)}`);
            }
        }

        // then we'll also write out any issues found to a JSON file next to the cell source file
        if (issuesDuringConversion && issuesDuringConversion.length > 0) {
            let issuesPath;
            if (path.isAbsolute(details['issuesFilePath'])) {
                issuesPath = details['issuesFilePath'];
            } else {
                issuesPath = Uri.joinPath(workspace.workspaceFolders![0].uri, details['issuesFilePath']);
            }
            fs.writeFileSync(issuesPath.fsPath, JSON.stringify(issuesDuringConversion, null, 2));
        }

        if (!convertedCode) {
            throw new Error(`Unable to convert code. Please see issues section or retry.`);
        }

        return super.onKernelProcessResponseDetails(details, cell, notebook);
    }

    generateMarkdownOutput(
        notebook : NotebookDocument | BoostNotebook,
        cell : NotebookCell | BoostNotebookCell,
        details: any) : string {

        const usingBoostNotebook = notebook instanceof BoostNotebook;

        const outputLanguage = this.getOutputLanguage(notebook);
        const rawSourceBase = ('recommendedConvertedFilenameBase' in details)?details['recommendedConvertedFilenameBase']:"DEFAULT_FILENAME_BASE";
        let rawSourceExtension = ('convertedFileExtension' in details)?details['convertedFileExtension']:outputLanguage;
        if (rawSourceExtension.startsWith('.')) {
            // remove leading dot
            rawSourceExtension = rawSourceExtension.substr(1);
            details['convertedFileExtension'] = rawSourceExtension;
        }
        const convertedCode = details['convertedCode'];

        const originalSource = (notebook.metadata && 'sourceFile' in notebook.metadata)?
            fullPathFromSourceFile(notebook.metadata['sourceFile'] as string):
            (usingBoostNotebook?Uri.parse((notebook as BoostNotebook).fsPath):notebook.uri);
        const originalSourceFolder = path.dirname(originalSource.fsPath);
        const originalSourceBaseName = path.basename(originalSource.fsPath, path.extname(originalSource.fsPath));
        const sourceBase = rawSourceBase?rawSourceBase:originalSourceBaseName;
        const sourceExtension = rawSourceExtension?rawSourceExtension:outputLanguage;

        // we use a leading dot in the filename so its generally hidden
        const source = `.${sourceBase}.${sourceExtension}`;
        const nonNormalizedSourcePath = path.join(originalSourceFolder, source);
        const sourcePath = path.normalize(nonNormalizedSourcePath);
        const sourceUri = Uri.parse(sourcePath);

        const convertedFile = getBoostFile(sourceUri, {
            format: BoostFileType.generated,
            subFolder: outputLanguage,
        });

        // cell filename = the cell index
        const cellFilename = usingBoostNotebook?
            (notebook.cells.indexOf(cell as BoostNotebookCell).toString()):(cell as NotebookCell).index.toString() +
            `.${sourceExtension}`;

        const currentNotebookPath = usingBoostNotebook?(notebook as BoostNotebook).fsPath:notebook.uri.fsPath;

        let relativeLinkSourcePath;
        if (convertedCode) {
            const nonNormalizedPath = path.join(convertedFile.fsPath, cellFilename);
            const convertedPath = path.normalize(nonNormalizedPath);

            details['generatedCodeWorkingPath'] = workspace.asRelativePath(convertedPath);
            details['recommendedConvertedFilePath'] = workspace.asRelativePath(sourcePath);
            relativeLinkSourcePath = path.relative(currentNotebookPath, convertedPath);
        }
        let relativeLinkIssuesPath;
        if (details['issuesDuringConversion'] && details['issuesDuringConversion'].length > 0) {
            const nonNormalizedPath = path.join(convertedFile.fsPath, `${cellFilename}.issues.json`);
            const issuesPath = path.normalize(nonNormalizedPath);
            details['issuesFilePath'] = workspace.asRelativePath(issuesPath);

            relativeLinkIssuesPath = path.relative(currentNotebookPath, issuesPath);
        }

        let markdownOutput =
            `#### ${convertedCode?"Successful":"Incomplete"} Code Generation with ${outputLanguage}\n`;
        if (convertedCode) {
            // markdown relative links don't work in Notebook in VSC - only filename is used
            //     and we don't want to use absolute path because it won't work on other machines
//            markdownOutput += `\n[Link to Converted Code](${relativeLinkSourcePath})\n`;
            if ('recommendedConvertedFilenameBase' in details) {
                markdownOutput += `##### Recommended Filename: ${rawSourceBase}.${rawSourceExtension}\n`;
            }
        }

        if ('issuesDuringConversion' in details && details['issuesDuringConversion'].length > 0) {
            markdownOutput += `##### Conversion Notes:\n` +
                `* ${details['issuesDuringConversion'].join("\n* ")}\n`;
            // markdown relative links don't work in Notebook in VSC - only filename is used
//            markdownOutput += `\n[Link to Issues](${relativeLinkIssuesPath})\n`;
        } else {
            markdownOutput += `##### Conversion Notes: None\n`;
        }

        return markdownOutput;
    }
}
