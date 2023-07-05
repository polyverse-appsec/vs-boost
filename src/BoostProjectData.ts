import * as fs from "fs";
import * as path from "path";
import { BoostUserAnalysisType } from "./extension";
import * as boostnb from "./jupyter_notebook";
import * as vscode from "vscode";
import { errorMimeType } from "./base_controller";
import { boostLogging } from "./boostLogging";

export const PROJECT_EXTENSION = ".boost-project";

import {
    IBoostProjectData,
    Summary,
    SectionSummary,
    FileSummaryItem,
    emptyProjectData,
    BoostProcessingStatus,
} from "./boostprojectdata_interface";
import { sum } from "lodash";

export class BoostProjectData implements IBoostProjectData {
    summary: Summary;
    sectionSummary: { [key: string]: SectionSummary };
    fsPath: string;
    files: {
        [filename: string]: FileSummaryItem;
    };

    constructor() {
        this.summary = { ...emptyProjectData.summary };
        this.sectionSummary = {};
        //loop through the keys of the emptyProjectData.sectionSummary object and copy the values to the new object
        Object.keys(emptyProjectData.sectionSummary).forEach((key) => {
            this.sectionSummary[key] = {
                ...emptyProjectData.sectionSummary[key],
            };
        });
        this.fsPath = "";
        this.files = {};
    }

    create(jsonString: string): void {
        const projectData = JSON.parse(jsonString) as BoostProjectData;
        Object.assign(this, projectData);
    }

    load(filePath: string): void {
        const jsonString = fs.readFileSync(filePath, "utf8");
        try {
            this.create(jsonString);
        } catch (e) {
            if (e instanceof SyntaxError) {
                throw new SyntaxError(
                    `Could not parse notebook ${filePath} due to invalid JSON: ${e}`
                );
            } else {
                throw e;
            }
        }
        this.fsPath = filePath;
    }

    save(filename: string): void {
        // Create any necessary folders
        const folderPath = path.dirname(filename);
        fs.mkdirSync(folderPath, { recursive: true });

        this.fsPath = filename;

        // no need to persist the path into the file
        const { fsPath, ...dataWithoutFsPath } = this;
        const projectDataJson = JSON.stringify(dataWithoutFsPath, null, 2);

        fs.writeFileSync(filename, projectDataJson, { encoding: "utf8" });
    }

    flushToFS(): void {
        this.save(this.fsPath);
    }
    private addFileSummaryToSectionSummaries(
        fileSummary: FileSummaryItem,
        previous: FileSummaryItem
    ): void {
        // first remove the previous file summary from the section summaries
        let sections = [];
        // if previous and fileSummary are the same object, then skip everything and put an error in the log
        if (previous === fileSummary) {
            boostLogging.error("previous and fileSummary are the same object");
            return;
        }

        if (previous) {
            sections = Object.keys(previous.sections);
            sections.forEach((section) => {
                const sectionSummary = this.sectionSummary[section];
                if (sectionSummary) {
                    sectionSummary.totalCells -=
                        previous.sections[section].totalCells;
                    sectionSummary.completedCells -=
                        previous.sections[section].completedCells;
                    sectionSummary.errorCells -=
                        previous.sections[section].errorCells;
                    sectionSummary.filesAnalyzed -= 1;
                } else {
                    boostLogging.error(
                        `Section ${section} not found in sectionSummary`
                    );
                }
            });
        }

        sections = Object.keys(fileSummary.sections);
        sections.forEach((section) => {
            const sectionSummary = this.sectionSummary[section];
            if (sectionSummary) {
                sectionSummary.totalCells +=
                    fileSummary.sections[section].totalCells;
                sectionSummary.completedCells +=
                    fileSummary.sections[section].completedCells;
                sectionSummary.errorCells +=
                    fileSummary.sections[section].errorCells;
                sectionSummary.filesAnalyzed += 1;

                if (
                    sectionSummary.completedCells === sectionSummary.totalCells
                ) {
                    sectionSummary.status = BoostProcessingStatus.completed;
                } else if (sectionSummary.completedCells > 0) {
                    sectionSummary.status = BoostProcessingStatus.incomplete;
                } else {
                    sectionSummary.status = BoostProcessingStatus.notStarted;
                }
            } else {
                boostLogging.error(
                    `Section ${section} not found in sectionSummary`
                );
            }
        });
    }

    updateWithFileSummary(
        fileSummary: FileSummaryItem,
        relativePath: string
    ): void {
        const previous = this.files[relativePath];
        this.addFileSummaryToSectionSummaries(fileSummary, previous);
        this.files[relativePath] = fileSummary;
        //now update the overall summary
        //if it's a new file i.e. no previous), then we update the filesAnalyzed count
        if (!previous) {
            this.summary.filesAnalyzed += 1;
        }
    }

    static get default(): BoostProjectData {
        const boostProjectData = new BoostProjectData();
        Object.assign(boostProjectData, emptyProjectData);
        return boostProjectData;
    }
}

export function boostNotebookToFileSummaryItem(
    boostNotebook: boostnb.BoostNotebook
): FileSummaryItem {
    let summaryItem: FileSummaryItem = {
        sourceFile: boostNotebook.metadata.sourceFile as string,
        totalCells: 0,
        completedCells: 0,
        errorCells: 0,
        issueCells: 0,
        sections: {},
    };

    boostNotebook.cells.forEach((cell) => {
        cell.outputs.forEach((output) => {
            let thisSection = summaryItem.sections[output.metadata.outputType];
            if (!thisSection) {
                thisSection = {
                    analysisType: output.metadata.outputType,
                    status: BoostProcessingStatus.notStarted,
                    completedCells: 0,
                    errorCells: 0,
                    issueCells: 0,
                    totalCells: 0,
                    filesAnalyzed: 1,
                };
                summaryItem.sections[output.metadata.outputType] = thisSection;
            }
            output.items.forEach((outputItem) => {
                thisSection.totalCells++;
                summaryItem.totalCells++;
                if (outputItem.mime === errorMimeType) {
                    thisSection.errorCells++;
                    summaryItem.errorCells++;
                } else if (outputItem.data) {
                    thisSection.completedCells++;
                    summaryItem.completedCells++;
                }
            });
            //now add the details if it exists on the output metadata.
            //if thisSection.details does not exist, then assign metadata.details to thisSection.details
            //otherwise merge the two arrays

            if (output.metadata.details) {
                thisSection.issueCells++;
                summaryItem.issueCells++;
                if (!thisSection.details) {
                    thisSection.details = output.metadata.details;
                } else {
                    thisSection.details = thisSection.details.concat(
                        output.metadata.details
                    );
                }
            }
            //now set the status of the section
            if (thisSection.completedCells === thisSection.totalCells) {
                thisSection.status = BoostProcessingStatus.completed;
            } else if (thisSection.completedCells > 0) {
                thisSection.status = BoostProcessingStatus.incomplete;
            } else {
                thisSection.status = BoostProcessingStatus.notStarted;
            }
        });
    });

    return summaryItem;
}

//NOTE! this will return a new FileSummaryItem object
export function boostNotebookFileToFileSummaryItem(
    file: vscode.Uri
): FileSummaryItem {
    const boostNotebook = new boostnb.BoostNotebook();
    boostNotebook.load(file.fsPath);
    return boostNotebookToFileSummaryItem(boostNotebook);
}
