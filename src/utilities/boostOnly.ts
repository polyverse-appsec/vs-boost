import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import micromatch from 'micromatch';

import { boostLogging } from './boostLogging';

const BOOST_ONLY_FILE = '.boostOnly';

function readBoostOnlyFile(targetFolder: vscode.Uri): string[] {
    const filePath = path.join(targetFolder.fsPath, BOOST_ONLY_FILE);
    if (!fs.existsSync(filePath)) {
        return [];
    }
    return fs.readFileSync(filePath, 'utf-8').split('\n').filter(line => line.trim() !== '');
}

function writeBoostOnlyFile(targetFolder: vscode.Uri, patterns: string[]): void {
    const filePath = path.join(targetFolder.fsPath, BOOST_ONLY_FILE);
    fs.writeFileSync(filePath, patterns.join('\n'), 'utf-8');
}

export function addToBoostOnly(fileOrFolder: string): void {
    // we're going to assume this is a UI-based action, so we'll show a warning
    const showUI = true;

    const targetFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!targetFolder) {
        boostLogging.warn(`Please load a Project folder first`, showUI);
        return;
    }

    const currentPatterns = readBoostOnlyFile(targetFolder);
    const targetRelativePath = vscode.workspace.asRelativePath(
        vscode.Uri.parse(fileOrFolder),
        false
    );
    
    if (!fs.existsSync(vscode.Uri.parse(fileOrFolder).fsPath)) {
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

    const stats = fs.statSync(vscode.Uri.parse(fileOrFolder).fsPath);
    if (stats.isDirectory()) {
        currentPatterns.push(targetRelativePath + "/**");
    } else if (stats.isFile()) {
        currentPatterns.push(targetRelativePath);
    }

    writeBoostOnlyFile(targetFolder, currentPatterns);
}

export function removeFromBoostOnly(fileOrFolder: string): void {
    // we're going to assume this is a UI-based action, so we'll show a warning
    const showUI = true;

    const targetFolder = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!targetFolder) {
        boostLogging.warn(`Please load a Project folder first`, showUI);
        return;
    }
    
    const currentPatterns = readBoostOnlyFile(targetFolder);
    let targetRelativePath: string;

    // Convert path to relative path
    targetRelativePath = vscode.workspace.asRelativePath(
        vscode.Uri.parse(fileOrFolder),
        false
    );

    if (!currentPatterns.some((pattern) =>
            micromatch.isMatch(targetRelativePath, pattern)
        )) {
        boostLogging.warn(`${targetRelativePath} is not found in ${BOOST_ONLY_FILE} or doesn't match any pattern`, false);
        return;
    }

    // If the target is a directory, consider removing the pattern with '/**', else just the relative path
    const updatedPatterns = fs.statSync(vscode.Uri.parse(fileOrFolder).fsPath).isDirectory() ?
        currentPatterns.filter(pattern => pattern !== targetRelativePath + "/**") :
        currentPatterns.filter(pattern => pattern !== targetRelativePath);

    writeBoostOnlyFile(targetFolder, updatedPatterns);

}

export function buildBoostOnlyPatterns(targetFolder: vscode.Uri): string[] {
    return readBoostOnlyFile(targetFolder);
}