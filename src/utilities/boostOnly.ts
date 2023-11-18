import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import micromatch from 'micromatch';

import { boostLogging } from './boostLogging';

const BOOST_ONLY_FILE = '.boostOnly';
const BOOST_INCLUDE_FILE = '.boostInclude';

function readBoostInclusionFile(inclusionFilename: string, targetFolder: vscode.Uri): string[] {
    const filePath = path.join(targetFolder.fsPath, inclusionFilename);
    if (!fs.existsSync(filePath)) {
        return [];
    }
    return fs.readFileSync(filePath, 'utf-8').split('\n').filter(line => line.trim() !== '');
}

function writeBoostInclusionFile(inclusionFilename: string, targetFolder: vscode.Uri, patterns: string[]): void {
    const filePath = path.join(targetFolder.fsPath, inclusionFilename);
    fs.writeFileSync(filePath, patterns.join('\n'), 'utf-8');
}

export function addToBoostInclude(fileOrFolder: string): void {
    addToBoostIncludeOrOnlyFile(fileOrFolder, false);
}
export function addToBoostOnly(fileOrFolder: string): void {
    addToBoostIncludeOrOnlyFile(fileOrFolder, true);
}

export function addToBoostIncludeOrOnlyFile(fileOrFolder: string, exclusiveInclude: boolean): void {
    // we're going to assume this is a UI-based action, so we'll show a warning
    const showUI = true;

    const targetFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!targetFolder) {
        boostLogging.warn(`Please load a Project folder first`, showUI);
        return;
    }

    const currentPatterns = readBoostInclusionFile(exclusiveInclude?BOOST_ONLY_FILE:BOOST_INCLUDE_FILE, targetFolder);
    const targetRelativePath = vscode.workspace.asRelativePath(
        vscode.Uri.file(fileOrFolder),
        false
    );
    
    if (!fs.existsSync(vscode.Uri.file(fileOrFolder).fsPath)) {
        boostLogging.warn(`Unable to determine existence of file: ${fileOrFolder}`, true);
        return;
    } else if (
        currentPatterns.some((pattern) =>
            micromatch.isMatch(targetRelativePath, pattern)
        )
    ) {
        boostLogging.warn(`${targetRelativePath} is already included in ${BOOST_ONLY_FILE}`, false);
        return;
    }

    const stats = fs.statSync(vscode.Uri.file(fileOrFolder).fsPath);
    if (stats.isDirectory()) {
        currentPatterns.push(targetRelativePath + "/**");
    } else if (stats.isFile()) {
        currentPatterns.push(targetRelativePath);
    }

    writeBoostInclusionFile(exclusiveInclude?BOOST_ONLY_FILE:BOOST_INCLUDE_FILE, targetFolder, currentPatterns);
}

export function removeFromBoostOnly(fileOrFolder: string): void {
    // we're going to assume this is a UI-based action, so we'll show a warning
    const showUI = true;

    const targetFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!targetFolder) {
        boostLogging.warn(`Please load a Project folder first`, showUI);
        return;
    }
    
    const currentPatterns = readBoostInclusionFile(BOOST_ONLY_FILE, targetFolder);
    let targetRelativePath: string;

    // Convert path to relative path
    targetRelativePath = vscode.workspace.asRelativePath(
        vscode.Uri.file(fileOrFolder),
        false
    );

    if (!currentPatterns.some((pattern) =>
            micromatch.isMatch(targetRelativePath, pattern)
        )) {
        boostLogging.warn(`${targetRelativePath} is not found in ${BOOST_ONLY_FILE} or doesn't match any pattern`, false);
        return;
    }

    // If the target is a directory, consider removing the pattern with '/**', else just the relative path
    const updatedPatterns = fs.statSync(vscode.Uri.file(fileOrFolder).fsPath).isDirectory() ?
        currentPatterns.filter(pattern => pattern !== targetRelativePath + "/**") :
        currentPatterns.filter(pattern => pattern !== targetRelativePath);

    writeBoostInclusionFile(BOOST_ONLY_FILE, targetFolder, updatedPatterns);

}

export function buildBoostOnlyPatterns(targetFolder: vscode.Uri): string[] {
    return readBoostInclusionFile(BOOST_ONLY_FILE, targetFolder);
}